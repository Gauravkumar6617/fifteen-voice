"""Tool name -> (JSON schema, handler). Every tool runs here on the server, never in the browser."""
import logging

from app.tools import store_status

log = logging.getLogger("tools")

TOOLS = {
    "get_store_status": (store_status.SCHEMA, store_status.get_store_status),
}

SCHEMAS = [schema for schema, _ in TOOLS.values()]


def run(name: str, args: dict) -> tuple[dict, bool]:
    """Returns (result, is_error). Never raises, so a broken tool can't kill the voice session."""
    if name not in TOOLS:
        return {"error": f"Unknown tool: {name}"}, True
    try:
        return TOOLS[name][1](args), False
    except Exception as e:
        log.exception("tool %s failed", name)
        return {"error": str(e)}, True
