"""流式(SSE)链路断言——coding agent 的主流量形态(journal/TODO 审计项)。

两个 wire format 各验证两件事:
1. 透传:客户端逐块收到增量内容,拼起来等于上游发出的全文;
2. 计费:流结束后 usage.completed 发布,token 数取的是 provider 在流尾
   回报的值(42/7,fake_provider 恒定值),estimated=false——而不是网关
   自行估算的近似值。客户端**不带** stream_options.include_usage,验证
   计费正确性不依赖客户端配合。
"""

from __future__ import annotations

import json

from conftest import PROVIDER_KEYS, TOKENS, stream_sse_lines
from test_gateway import USAGE_SCHEMA, _events_matching

import jsonschema

FULL_REPLY = "fake streaming reply"


def test_openai_streaming_passthrough_and_usage_event(redis_client):
    status, lines = stream_sse_lines(
        "/v1/chat/completions",
        TOKENS["u_ok"],
        {
            "model": "openai/gpt-stream-ok",
            "messages": [{"role": "user", "content": "stream me"}],
            "stream": True,
        },
    )
    assert status == 200

    payloads = [
        json.loads(line[len("data: ") :])
        for line in lines
        if line.startswith("data: ") and line != "data: [DONE]"
    ]
    deltas = [
        p["choices"][0]["delta"].get("content", "")
        for p in payloads
        if p.get("choices")
    ]
    # 增量透传:内容分多块到达,而不是被缓冲成一整块
    content_chunks = [d for d in deltas if d]
    assert len(content_chunks) > 1, f"expected incremental chunks, got {deltas!r}"
    assert "".join(deltas) == FULL_REPLY
    assert lines[-1] == "data: [DONE]"

    # Key 注入在流式路径同样生效
    assert redis_client.get("test:last_openai_auth") == (
        f"Bearer {PROVIDER_KEYS[('u_ok', 'openai')]}"
    )

    events = _events_matching(redis_client, model="gpt-stream-ok")
    assert len(events) == 1, events
    event = events[0]
    jsonschema.validate(event, USAGE_SCHEMA)
    assert event["user_id"] == "u_ok"
    assert event["provider"] == "openai"
    assert event["key_source"] == "byok"
    assert event["status"] == "ok"
    # 权威数字来自 provider 流尾回报,不是网关估算
    assert event["input_tokens"] == 42
    assert event["output_tokens"] == 7
    assert event["estimated"] is False


def test_anthropic_streaming_passthrough_and_usage_event(redis_client):
    status, lines = stream_sse_lines(
        "/v1/messages",
        TOKENS["u_ok"],
        {
            "model": "anthropic/claude-3-haiku-stream",
            "max_tokens": 128,
            "messages": [{"role": "user", "content": "stream me"}],
            "stream": True,
        },
    )
    assert status == 200

    event_names = [line[len("event: ") :] for line in lines if line.startswith("event: ")]
    assert "message_start" in event_names
    assert "message_stop" in event_names

    texts = [
        payload["delta"]["text"]
        for line in lines
        if line.startswith("data: ")
        and (payload := json.loads(line[len("data: ") :])).get("type") == "content_block_delta"
    ]
    assert len(texts) > 1, f"expected incremental deltas, got {event_names!r}"
    assert "".join(texts) == FULL_REPLY

    assert redis_client.get("test:last_anthropic_auth") == PROVIDER_KEYS[("u_ok", "anthropic")]

    events = _events_matching(redis_client, model="claude-3-haiku-stream")
    assert len(events) == 1, events
    event = events[0]
    jsonschema.validate(event, USAGE_SCHEMA)
    assert event["user_id"] == "u_ok"
    assert event["provider"] == "anthropic"
    assert event["key_source"] == "byok"
    assert event["status"] == "ok"
    assert event["input_tokens"] == 42
    assert event["output_tokens"] == 7
    assert event["estimated"] is False
