"""Who the agent is. Sent as the first message on every upstream connection."""
from app.tools.registry import SCHEMAS

SYSTEM_PROMPT = (
    "You are Fifteen, a voice assistant for a store owner. Keep replies to one or two sentences. "
    "When asked anything about the store, call get_store_status. Never invent numbers."
)

GREETING = "Hi, I'm Fifteen. Tell me what sale you want to run."

SESSION_UPDATE = {
    "type": "session.update",
    "session": {
        "system_prompt": SYSTEM_PROMPT,
        "greeting": GREETING,
        "output": {"voice": "anna"},
        "tools": SCHEMAS,
    },
}
