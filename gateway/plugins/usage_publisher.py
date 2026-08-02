"""success/failure callbacks: assemble and publish ``usage.completed``.

The event is the gateway's single output contract (architecture A5) and the
sole billing source (tech-design §2.3). Guarantees enforced here:

- every event is validated against the JSON Schema artifact exported from
  ``packages/shared`` before publishing — a schema-invalid event is a bug and
  raises instead of poisoning downstream consumers;
- publish failures go to the local spool and are re-drained on later
  callbacks (see spool.py); consumers dedupe on ``event_id``;
- when the provider returned no usage numbers, tokens are estimated with
  litellm's counter and the event carries ``estimated: true`` (§2.2);
- the gateway knows accounts, never game concepts: only ``user_id`` is
  attached (§2.3).
"""

from __future__ import annotations

import datetime
import logging
import uuid

import jsonschema
from litellm.integrations.custom_logger import CustomLogger

from mogwai_common import SPOOL_PATH, USAGE_STREAM, get_redis, load_json_schema
from spool import UsageSpool

logger = logging.getLogger("mogwai.gateway.usage_publisher")


class UsagePublisher(CustomLogger):
    def __init__(self) -> None:
        super().__init__()
        self._spool = UsageSpool(USAGE_STREAM, SPOOL_PATH)

    # -- litellm entry points -------------------------------------------------

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        event = self._build_event(kwargs, response_obj, start_time, end_time, status="ok")
        await self._validate_and_publish(event)

    async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
        exception = kwargs.get("exception")
        status = "timeout" if "Timeout" in type(exception).__name__ else "error"
        event = self._build_event(kwargs, None, start_time, end_time, status=status)
        await self._validate_and_publish(event)

    # -- internals -------------------------------------------------------------

    def _build_event(self, kwargs, response_obj, start_time, end_time, status: str) -> dict:
        # 计费事件的每个字段都必须有权威来源;来源缺失一律抛错(callback 错误
        # 会进 litellm 日志,配合每日对账暴露缺口),绝不静默填默认值。
        litellm_params = kwargs.get("litellm_params", {})
        # 元数据按路由落在 metadata(OpenAI 兼容)或 litellm_metadata
        # (/v1/messages)——两个已知位置的确定性合并,不是猜测式兜底。
        metadata = {
            **(litellm_params.get("litellm_metadata") or {}),
            **(litellm_params.get("metadata") or {}),
        }
        user_id = metadata.get("user_api_key_user_id")
        if not user_id:
            raise ValueError(
                "usage_publisher: no user_id in callback metadata — "
                "platform_auth must have run for every proxied request"
            )

        # key_source 由 key_resolver 写入元数据;取不到说明元数据链路断了,
        # 静默默认会把假的 key_source 送进账本(M4 债务路由后果更重)。
        key_source = metadata.get("mogwai_key_source")
        if not key_source:
            raise ValueError(
                "usage_publisher: mogwai_key_source missing from callback metadata "
                "— key_resolver metadata did not flow through for this route"
            )

        # /v1/messages 路由的回调里模型名不带 provider/ 前缀,前缀解析已实证
        # 会错;唯一权威来源是回调 kwargs 顶层的 custom_llm_provider,不做兜底。
        provider = kwargs.get("custom_llm_provider")
        if not provider:
            raise ValueError(
                "usage_publisher: custom_llm_provider missing from callback kwargs "
                "— litellm behavior changed, provider attribution would be wrong"
            )
        public_model: str = kwargs.get("model", "")
        _, _, suffix = public_model.partition("/")
        model = suffix or public_model

        request_id = kwargs.get("litellm_call_id")
        if not request_id:
            raise ValueError(
                "usage_publisher: litellm_call_id missing — a random request_id "
                "would poison log/trace correlation"
            )

        # 流式:litellm 在流结束后才触发 success 回调,聚合后的完整响应放在
        # kwargs["complete_streaming_response"](response_obj 只是末尾 chunk)。
        # 两个已知位置的确定性取值,与 metadata 的处理同一纪律,不是猜测式兜底。
        response = kwargs.get("complete_streaming_response") or response_obj
        usage = getattr(response, "usage", None)
        estimated = False
        if usage is not None:
            input_tokens = usage.prompt_tokens or 0
            output_tokens = usage.completion_tokens or 0
            cached = self._cached_tokens(usage)
        else:
            # Provider returned no usage (or the call failed): estimate the
            # prompt side so billing still sees the load, flag it (§2.2).
            input_tokens = self._estimate_input_tokens(kwargs, public_model)
            output_tokens = 0
            cached = 0
            estimated = True

        return {
            "schema_version": 1,
            "event_id": str(uuid.uuid4()),
            "user_id": user_id,
            "request_id": request_id,
            "provider": provider,
            "model": model,
            "key_source": key_source,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cached_tokens": cached,
            "latency_ms": max(0, int((end_time - start_time).total_seconds() * 1000)),
            "status": status,
            "estimated": estimated,
            # Wired when Langfuse lands with M2 telemetry (journal/TODO.md).
            "langfuse_trace_id": None,
            "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

    async def _validate_and_publish(self, event: dict) -> None:
        jsonschema.validate(event, load_json_schema("events/usage.completed.schema.json"))
        await self._spool.publish_or_spool(get_redis(), event)

    @staticmethod
    def _cached_tokens(usage) -> int:
        details = getattr(usage, "prompt_tokens_details", None)
        return getattr(details, "cached_tokens", 0) or 0

    @staticmethod
    def _estimate_input_tokens(kwargs, public_model: str) -> int:
        import litellm

        messages = kwargs.get("messages")
        if not messages:
            return 0
        try:
            return litellm.token_counter(model=public_model, messages=messages)
        except Exception:
            # 降级是显式决策:0 + estimated 标记 + 带堆栈的错误日志,
            # 每日对账覆盖数值缺口(§2.3);吞异常不留痕是禁止的。
            logger.exception(
                "usage_publisher: token estimate failed for model %r; "
                "emitting input_tokens=0 with estimated=true",
                public_model,
            )
            return 0


usage_publisher_instance = UsagePublisher()
