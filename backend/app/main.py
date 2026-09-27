"""FastAPI entry point: CORS, /health and the /ws/voice relay."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config  # noqa: F401  (the import itself fails fast if the API key is missing)
from app.voice.relay import router as voice_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")

app = FastAPI(title="Fifteen")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(voice_router)


@app.get("/health")
def health():
    return {"status": "ok"}
