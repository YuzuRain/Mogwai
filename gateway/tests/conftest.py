"""Seeds the Redis projections the gateway reads, then waits for readiness.

Seed data lives only here (dedicated test seed, per no-mocks rule). The
projection layouts mirror packages/shared/src/projections/*.ts — if those
schemas change, this file must change in the same commit.

Personas:

==============  =============================================================
u_ok            hosted openai key (no whitelist) + anthropic key
                (whitelisted to claude-3-haiku only)
u_blocked_tok   token carries the rejection flag             -> 403
u_fee_blocked   billing verdict blocked in authz projection  -> 402
u_creditor      has outstanding credits (debt routing = M4)  -> loud failure
u_nokey         valid token, nothing hosted                  -> 400
u_ratelimited   token projection carries rpm=1               -> 429 on burst
==============  =============================================================
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import time

import httpx
import pytest
import redis as redis_lib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

GATEWAY_URL = os.environ["GATEWAY_URL"]
REDIS_URL = os.environ["REDIS_URL"]
KEK = bytes.fromhex(os.environ["MOGWAI_DEV_KEK"])

TOKENS = {
    "u_ok": "sk_test_ok_token",
    "u_blocked_tok": "sk_test_blocked_token",
    "u_fee_blocked": "sk_test_fee_blocked_token",
    "u_creditor": "sk_test_creditor_token",
    "u_nokey": "sk_test_nokey_token",
    "u_ratelimited": "sk_test_ratelimited_token",
}

# What the fake provider must receive after envelope decryption:
PROVIDER_KEYS = {
    ("u_ok", "openai"): "sk-fake-openai-OK1",
    ("u_ok", "anthropic"): "sk-fake-anthropic-OK2",
    ("u_creditor", "openai"): "sk-fake-openai-CRED",
    ("u_ratelimited", "openai"): "sk-fake-openai-RATE",
}


def _envelope_encrypt(plaintext: str) -> dict:
    """Mirror of the account module's envelope format (gateway/plugins/kms.py)."""
    dek = os.urandom(32)
    dek_nonce = os.urandom(12)
    encrypted_dek = base64.b64encode(
        dek_nonce + AESGCM(KEK).encrypt(dek_nonce, dek, None)
    ).decode()
    key_nonce = os.urandom(12)
    ciphertext = AESGCM(dek).encrypt(key_nonce, plaintext.encode(), None)
    return {
        "nonce": base64.b64encode(key_nonce).decode(),
        "ciphertext": base64.b64encode(ciphertext).decode(),
        "encrypted_dek": encrypted_dek,
    }


def _key_entry(key_id: str, provider: str, plaintext_key: str, whitelist: list[str]) -> dict:
    return {
        "key_id": key_id,
        "provider": provider,
        "model_whitelist": whitelist,
        **_envelope_encrypt(plaintext_key),
    }


@pytest.fixture(scope="session")
def redis_client() -> redis_lib.Redis:
    return redis_lib.Redis.from_url(REDIS_URL, decode_responses=True)


@pytest.fixture(scope="session", autouse=True)
def seeded_gateway(redis_client: redis_lib.Redis):
    # token projections
    for user_id, token in TOKENS.items():
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        mapping = {
            "user_id": user_id,
            "privacy_mode": "0",
            "blocked": "1" if user_id == "u_blocked_tok" else "0",
        }
        if user_id == "u_ratelimited":
            mapping["rpm"] = "1"  # shared projections/token.ts 可选字段
        redis_client.hset(f"proj:token:{token_hash}", mapping=mapping)

    # key-routing projections
    redis_client.set(
        "proj:keys:u_ok",
        json.dumps(
            [
                _key_entry("pk_ok_openai", "openai", PROVIDER_KEYS[("u_ok", "openai")], []),
                _key_entry(
                    "pk_ok_anthropic",
                    "anthropic",
                    PROVIDER_KEYS[("u_ok", "anthropic")],
                    # 第二个名字给流式用例专用:回调异步落流,靠专属模型名隔离事件
                    ["claude-3-haiku", "claude-3-haiku-stream"],
                ),
            ]
        ),
    )
    redis_client.set(
        "proj:keys:u_creditor",
        json.dumps(
            [_key_entry("pk_cred", "openai", PROVIDER_KEYS[("u_creditor", "openai")], [])]
        ),
    )
    redis_client.set(
        "proj:keys:u_ratelimited",
        json.dumps(
            [_key_entry("pk_rate", "openai", PROVIDER_KEYS[("u_ratelimited", "openai")], [])]
        ),
    )

    # authorization projections
    redis_client.set(
        "proj:authz:u_fee_blocked",
        json.dumps(
            {
                "service_fee_owed_cp": 99999,
                "pledge_available_cp": 0,
                "debts": [],
                "credits": [],
                "blocked": True,
            }
        ),
    )
    redis_client.set(
        "proj:authz:u_creditor",
        json.dumps(
            {
                "service_fee_owed_cp": 0,
                "pledge_available_cp": 1000,
                "debts": [],
                "credits": [
                    {
                        "debtor_user_id": "u_nokey",
                        "amount_cp": 500,
                        "incurred_at": "2026-07-26T00:00:00Z",
                    }
                ],
                "blocked": False,
            }
        ),
    )

    _wait_for_gateway()
    yield


def _wait_for_gateway(timeout_s: int = 120) -> None:
    deadline = time.time() + timeout_s
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            if httpx.get(f"{GATEWAY_URL}/health/liveliness", timeout=2).status_code == 200:
                return
        except httpx.HTTPError as exc:
            last_error = exc
        time.sleep(2)
    raise RuntimeError(f"gateway not ready within {timeout_s}s: {last_error!r}")


def chat(token: str, model: str, content: str = "ping") -> httpx.Response:
    return httpx.post(
        f"{GATEWAY_URL}/v1/chat/completions",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": content}]},
        timeout=30,
    )


def anthropic_messages(token: str, model: str) -> httpx.Response:
    return httpx.post(
        f"{GATEWAY_URL}/v1/messages",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "model": model,
            "max_tokens": 128,
            "messages": [{"role": "user", "content": "ping"}],
        },
        timeout=30,
    )


def stream_sse_lines(path: str, token: str, payload: dict) -> tuple[int, list[str]]:
    """POST 一个流式请求,返回 (status_code, 非空 SSE 行列表)。"""
    lines: list[str] = []
    with httpx.stream(
        "POST",
        f"{GATEWAY_URL}{path}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    ) as resp:
        status = resp.status_code
        if status == 200:
            lines = [line for line in resp.iter_lines() if line]
    return status, lines
