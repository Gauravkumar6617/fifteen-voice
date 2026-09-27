"""Settings loaded from backend/.env. Importing this module fails fast if the key is missing."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY", "").strip()
if not ASSEMBLYAI_API_KEY:
    raise RuntimeError(
        "ASSEMBLYAI_API_KEY is not set. Copy backend/.env.example to backend/.env and add your key."
    )

ASSEMBLYAI_WS_URL = "wss://agents.assemblyai.com/v1/ws"
