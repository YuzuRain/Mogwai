"""success callback: assemble usage.completed (tech-design §2.3) -> XADD to Redis Streams.

Spike counterpart of architecture.md A4 usage_publisher. Local spool fallback and
failure events are out of spike scope (noted in README).
"""

import datetime
import json
import uuid

from litellm.integrations.custom_logger import CustomLogger

from spike_redis import get_redis

USAGE_STREAM = "events:usage.completed"


def _user_id_from(kwargs: dict) -> str:
    metadata = kwargs.get("litellm_params", {}).get("metadata") or {}
    user_id = metadata.get("user_api_key_user_id")
    if not user_id:
        slo = kwargs.get("standard_logging_object") or {}
        user_id = (slo.get("metadata") or {}).get("user_api_key_user_id")
    if not user_id:
        raise ValueError("usage_publisher: cannot resolve user_id from callback kwargs")
    return user_id


class UsagePublisher(CustomLogger):
    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        usage = getattr(response_obj, "usage", None)
        model = kwargs.get("model", "")
        event = {
            "schema_version": 1,
            "event_id": str(uuid.uuid4()),
            "user_id": _user_id_from(kwargs),
            "request_id": kwargs.get("litellm_call_id", ""),
            "provider": model.split("/", 1)[0] if "/" in model else "openai",
            "model": model.split("/", 1)[-1],
            "key_source": "byok",
            "input_tokens": getattr(usage, "prompt_tokens", None),
            "output_tokens": getattr(usage, "completion_tokens", None),
            "cached_tokens": 0,
            "latency_ms": int((end_time - start_time).total_seconds() * 1000),
            "status": "ok",
            "langfuse_trace_id": None,  # Langfuse 不在 spike 范围
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        await get_redis().xadd(USAGE_STREAM, {"payload": json.dumps(event)})


usage_publisher_instance = UsagePublisher()
