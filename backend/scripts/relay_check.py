"""Checks the /ws/voice relay against a fake AssemblyAI. No API key or network needed.

Run from backend/:  python scripts/relay_check.py
"""
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # make `app` importable
os.environ.setdefault("ASSEMBLYAI_API_KEY", "test")

import uvicorn  # noqa: E402
from websockets.asyncio.client import connect  # noqa: E402
from websockets.asyncio.server import serve  # noqa: E402

from app.main import app  # noqa: E402
from app.voice import relay  # noqa: E402

RELAY_PORT, FAKE_PORT = 18765, 18766
sessions: list[list[dict]] = []  # per upstream connection: every message the relay sent AssemblyAI
upstreams: asyncio.Queue = asyncio.Queue()


def ev(kind, **fields):
    return json.dumps({"type": kind, **fields})


async def fake_assemblyai(ws):
    got: list[dict] = []
    sessions.append(got)
    await upstreams.put(ws)
    async for raw in ws:
        msg = json.loads(raw)
        got.append(msg)
        if msg["type"] == "session.update":
            await ws.send(ev("session.ready", session_id="sess_test"))
        elif msg["type"] == "session.end":
            await ws.send(ev("session.ended"))


async def until(browser, kind):
    """Collect browser-side events up to and including the first `kind`."""
    seen = []
    while not seen or seen[-1]["type"] != kind:
        seen.append(json.loads(await asyncio.wait_for(browser.recv(), 3)))
    return seen


async def main():
    relay.ASSEMBLYAI_WS_URL = f"ws://localhost:{FAKE_PORT}"
    server = uvicorn.Server(uvicorn.Config(app, port=RELAY_PORT, log_level="warning"))
    serving = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)

    async with serve(fake_assemblyai, "localhost", FAKE_PORT):
        # 1. Normal session: tool calls, then Stop.
        async with connect(f"ws://localhost:{RELAY_PORT}/ws/voice") as browser:
            await until(browser, "session.ready")
            await browser.send(ev("session.update", session={"system_prompt": "evil"}))  # must be dropped
            await browser.send(ev("input.audio", audio="AAAA"))
            up = await upstreams.get()
            await up.send(ev("tool.call", call_id="c1", name="get_store_status", arguments={}))
            await up.send(ev("reply.done", status="interrupted"))  # c1 must never run
            await up.send(ev("tool.call", call_id="c2", name="get_store_status", arguments={}))
            await up.send(ev("reply.done", status="completed"))
            seen = await until(browser, "tool.result.sent")
            await browser.send(ev("session.end"))
            seen += await until(browser, "session.ended")

        sent = sessions[0]
        kinds = [m["type"] for m in sent]
        assert kinds.count("session.update") == 1, kinds
        assert kinds[0] == "session.update" and kinds[-1] == "session.end", kinds
        assert "input.audio" in kinds, kinds
        results = [m for m in sent if m["type"] == "tool.result"]
        assert [r["call_id"] for r in results] == ["c2"], results
        assert isinstance(results[0]["result"], str), "result must be a JSON string"
        assert json.loads(results[0]["result"])["product_count"] == 200
        shown = [e for e in seen if e["type"] == "tool.result.sent"]
        assert len(shown) == 1 and shown[0]["result"]["product_count"] == 200, shown

        # 2. Browser vanishes without saying goodbye: relay must still send session.end.
        async with connect(f"ws://localhost:{RELAY_PORT}/ws/voice") as browser:
            await until(browser, "session.ready")
        for _ in range(40):
            if sessions[1] and sessions[1][-1]["type"] == "session.end":
                break
            await asyncio.sleep(0.05)
        assert sessions[1][-1]["type"] == "session.end", sessions[1]

    server.should_exit = True
    await serving
    print("relay_check OK")


if __name__ == "__main__":
    asyncio.run(main())
