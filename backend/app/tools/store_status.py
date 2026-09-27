"""Phase 1 test tool. Hardcoded until the mock store exists (Phase 2)."""

SCHEMA = {
    "type": "function",
    "name": "get_store_status",
    "description": "Get the store's name, how many products it has, and how many sales are active.",
    "parameters": {"type": "object", "properties": {}, "required": []},
}


def get_store_status(args: dict) -> dict:
    return {"store_name": "Demo Umbrella Co.", "product_count": 200, "active_sales": 1}
