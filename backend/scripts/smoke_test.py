"""Step b: talk to AssemblyAI directly (no browser, no mic).

Sends session.update, prints each event through the greeting's reply.done, then ends the session.
Run from backend/:  python scripts/smoke_test.py
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # make `app` importable

from websockets.asyncio.client import connect  # noqa: E402

from app.config import ASSEMBLYAI_API_KEY, ASSEMBLYAI_WS_URL  # noqa: E402
from app.voice.session_config import SESSION_UPDATE  # noqa: E402

SHOW = ("session_id", "status", "text", "code", "message", "param")


async def main() -> bool:
    headers = {"Authorization": f"Bearer {ASSEMBLYAI_API_KEY}"}
    async with connect(ASSEMBLYAI_WS_URL, additional_headers=headers) as ws:
        await ws.send(json.dumps(SESSION_UPDATE))
        audio_chunks = 0
        async for raw in ws:
            event = json.loads(raw)
            kind = event["type"]
            if kind == "reply.audio":
                audio_chunks += 1  # count, never print audio
                continue
            print(kind, {k: event[k] for k in SHOW if k in event})
            if kind == "reply.done":
                print(f"  ({audio_chunks} reply.audio chunks)")
                await ws.send(json.dumps({"type": "session.end"}))
            elif kind == "session.ended":
                return True
    return False  # upstream closed without session.ended


if __name__ == "__main__":
    ok = asyncio.run(asyncio.wait_for(main(), timeout=30))
    print("OK" if ok else "FAILED: no session.ended")
    sys.exit(0 if ok else 1)
