"""End-to-end assertions for the gateway (real Redis, test-double upstream).

Covers the M1 gateway acceptance (journal/TODO.md): auth via projections,
BYOK key injection, whitelist enforcement, dual wire format, and a
schema-valid usage.completed on both success and failure paths.
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema

from conftest import PROVIDER_KEYS, TOKENS, anthropic_messages, chat

USAGE_STREAM = "events:usage.completed"
USAGE_SCHEMA = json.loads(
    Path("/contracts/events/usage.completed.schema.json").read_text()
)


# --- auth (platform_auth) -----------------------------------------------------


def test_unknown_token_is_401(redis_client):
    assert chat("sk_wrong", "openai/gpt-4o-mini").status_code == 401


def test_blocked_token_is_403(redis_client):
    assert chat(TOKENS["u_blocked_tok"], "openai/gpt-4o-mini").status_code == 403


def test_billing_blocked_user_is_402(redis_client):
    assert chat(TOKENS["u_fee_blocked"], "openai/gpt-4o-mini").status_code == 402


# --- key routing (key_resolver) ------------------------------------------------


def test_byok_key_is_decrypted_and_injected(redis_client):
    resp = chat(TOKENS["u_ok"], "openai/gpt-4o-mini")
    assert resp.status_code == 200, resp.text
    assert "fake upstream reply" in resp.text
    seen = redis_client.get("test:last_openai_auth")
    assert seen == f"Bearer {PROVIDER_KEYS[('u_ok', 'openai')]}"


def test_model_whitelist_is_enforced(redis_client):
    resp = chat(TOKENS["u_ok"], "anthropic/claude-3-opus")  # only claude-3-haiku allowed
    assert resp.status_code == 400
    assert "no hosted anthropic key" in resp.text


def test_user_without_hosted_key_is_400(redis_client):
    resp = chat(TOKENS["u_nokey"], "openai/gpt-4o-mini")
    assert resp.status_code == 400
    assert "BYOK" in resp.text


def test_bare_model_name_is_rejected(redis_client):
    resp = chat(TOKENS["u_ok"], "gpt-4o-mini")
    assert resp.status_code == 400


def test_debt_routing_fails_loudly_until_m4(redis_client):
    resp = chat(TOKENS["u_creditor"], "openai/gpt-4o-mini")
    assert resp.status_code == 500
    assert "M4" in resp.text


# --- dual wire format -----------------------------------------------------------


def test_anthropic_messages_endpoint(redis_client):
    resp = anthropic_messages(TOKENS["u_ok"], "anthropic/claude-3-haiku")
    assert resp.status_code == 200, resp.text
    assert "fake upstream reply" in resp.text
    assert redis_client.get("test:last_anthropic_auth") == PROVIDER_KEYS[("u_ok", "anthropic")]

    # 该路由的回调不带 provider/ 前缀,事件 provider 必须仍然正确(publisher 用
    # litellm 的 custom_llm_provider 而非前缀解析);key_source 无默认值,
    # 断言成立即证明 litellm_metadata 通道在此路由真实流通
    events = _events_matching(redis_client, model="claude-3-haiku")
    assert events, "anthropic call must publish a usage event"
    assert events[-1]["provider"] == "anthropic"
    assert events[-1]["key_source"] == "byok"


# --- usage.completed (usage_publisher) ------------------------------------------


def test_success_event_matches_contract(redis_client):
    # 专属模型名:回调相对 HTTP 响应异步,靠它把本用例的事件与其他用例隔离
    assert chat(TOKENS["u_ok"], "openai/gpt-usage-ok", content="count me").status_code == 200
    events = _events_matching(redis_client, model="gpt-usage-ok")
    assert len(events) == 1, events
    event = events[0]
    jsonschema.validate(event, USAGE_SCHEMA)
    assert event["user_id"] == "u_ok"
    assert event["provider"] == "openai"
    assert event["key_source"] == "byok"
    assert event["input_tokens"] == 42
    assert event["output_tokens"] == 7
    assert event["status"] == "ok"
    assert event["estimated"] is False


def test_failure_event_is_published_and_estimated(redis_client):
    resp = chat(TOKENS["u_ok"], "openai/gpt-err-usage")  # fake provider returns 500
    assert resp.status_code >= 500
    events = _events_matching(redis_client, model="gpt-err-usage")
    assert len(events) == 1, events
    event = events[0]
    jsonschema.validate(event, USAGE_SCHEMA)
    assert event["status"] in ("error", "timeout")
    assert event["estimated"] is True
    assert event["user_id"] == "u_ok"


def _events_matching(redis_client, model: str, wait_s: float = 10.0) -> list[dict]:
    """Poll the stream for events of the given model (callbacks land async)."""
    import time

    deadline = time.time() + wait_s
    while time.time() < deadline:
        entries = redis_client.xrange(USAGE_STREAM)
        matched = [
            event
            for _, fields in entries
            if (event := json.loads(fields["payload"]))["model"] == model
        ]
        if matched:
            return matched
        time.sleep(0.3)
    return []
