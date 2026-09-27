"""WS /ws/voice: bridges one browser socket to one AssemblyAI Voice Agent session.

Browser -> AssemblyAI: only input.audio and session.end get through. Anything else is dropped,
so the browser can never change the prompt or the tools.
AssemblyAI -> browser: the events in TO_BROWSER, forwarded unchanged, plus our own
tool.result.sent and relay.error.

Tools: tool.call is queued, then run and answered inside the reply.done handler (API rule).
If the reply was interrupted, the queued calls are dropped without running, so a
call the user talked over never changes anything.
"""
import asyncio
import json
import logging
from contextlib import suppress

from fastapi import APIRouter, WebSocket
from websockets.asyncio.client import connect

from app.config import ASSEMBLYAI_API_KEY, ASSEMBLYAI_WS_URL
from app.tools import registry
from app.voice.session_config import SESSION_UPDATE

log = logging.getLogger("relay")
router = APIRouter()

TO_BROWSER = {
    "session.ready", "session.updated", "session.ended", "session.error", "error",
    "reply.started", "reply.audio", "reply.done",
    "transcript.user.delta", "transcript.user", "transcript.agent",
    "input.speech.started", "input.speech.stopped", "tool.call",
}
LOG_FIELDS = ("session_id", "status", "text", "interrupted", "name", "arguments", "code", "message", "param")


@router.websocket("/ws/voice")
async def voice(browser: WebSocket):
    await browser.accept()
    try:
        upstream = await connect(
            ASSEMBLYAI_WS_URL, additional_headers={"Authorization": f"Bearer {ASSEMBLYAI_API_KEY}"}
        )
    except Exception as e:
        log.error("upstream connect failed: %r", e)
        await browser.send_json({"type": "relay.error", "message": f"Can't reach AssemblyAI ({e})."})
        await browser.close()
        return

    await upstream.send(json.dumps(SESSION_UPDATE))
    log.info("-> session.update")
    ready = asyncio.Event()  # no audio goes upstream before session.ready
    ended = asyncio.Event()  # AssemblyAI confirmed session.ended
    calls: list[dict] = []  # tool.call events waiting for reply.done

    async def to_browser(event: dict):
        # The browser may already be gone. That must not stop us reading upstream.
        with suppress(Exception):
            await browser.send_json(event)

    async def browser_to_upstream():
        while True:
            msg = await browser.receive_json()
            kind = msg.get("type")
            if kind == "input.audio" and isinstance(msg.get("audio"), str):
                if ready.is_set():
                    await upstream.send(json.dumps({"type": "input.audio", "audio": msg["audio"]}))
            elif kind == "session.end":
                log.info("browser asked to end")
                return  # the shutdown below sends session.end upstream
            else:
                log.warning("dropped browser message type=%r", kind)

    async def upstream_to_browser():
        async for raw in upstream:
            event = json.loads(raw)
            kind = event.get("type")
            if kind == "reply.audio":
                log.debug(kind)  # never log audio payloads
            else:
                log.info("<- %s %s", kind, {k: event[k] for k in LOG_FIELDS if k in event})

            if kind == "session.ready":
                ready.set()
            elif kind == "tool.call":
                calls.append(event)
            elif kind == "reply.done":
                if event.get("status") == "interrupted":
                    if calls:
                        log.info("reply interrupted: dropping %d tool call(s) unrun", len(calls))
                else:
                    for call in calls:
                        result, is_error = registry.run(call["name"], call.get("arguments") or {})
                        await upstream.send(json.dumps({
                            "type": "tool.result",
                            "call_id": call["call_id"],
                            "result": json.dumps(result),  # the API wants a JSON string, not an object
                            "is_error": is_error,
                        }))
                        log.info("-> tool.result %s %s", call["name"], result)
                        await to_browser({"type": "tool.result.sent", "call_id": call["call_id"],
                                          "name": call["name"], "result": result})
                calls.clear()
            elif kind == "session.ended":
                ended.set()

            if kind in TO_BROWSER:
                await to_browser(event)
            if kind == "session.ended":
                return

    tasks = [asyncio.create_task(browser_to_upstream()), asyncio.create_task(upstream_to_browser())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if task.exception():
                log.info("side closed: %r", task.exception())
        # Always end the session explicitly: a dropped socket stays billable for 30 s.
        if not ended.is_set():
            await upstream.send(json.dumps({"type": "session.end"}))
            log.info("-> session.end")
            await asyncio.wait_for(ended.wait(), timeout=3)
    except Exception as e:
        log.warning("shutdown: %r", e)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await upstream.close()
        with suppress(Exception):
            await browser.close()
        log.info("relay closed")
