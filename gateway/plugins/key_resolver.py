"""pre-call hook: resolve which provider credential executes this request.

Routing priority (tech-design §2.2):

1. debt-clearing route — creditor's calls run on the debtor's hosted key
   (§10.3). Ships with M4 settlement; until then the presence of credits
   raises loudly instead of silently falling through (no-mocks rule);
2. caller's own hosted key for the request's provider (BYOK);
3. platform key pool (CP direct purchase) — M4+, launch is BYOK-only (§2.2),
   so "no key" is a normal 4xx, not a fallback.

Key material handling (tech-design §2.1 "网关内存中解密、用完即弃"):
ciphertext + envelope-encrypted DEK come from the key-routing projection;
the DEK is unwrapped via the KMS client, the plaintext key is injected into
this single request's params and never logged nor persisted.

The public model name follows ``provider/model`` (tech-design §2.2). The hook
runs before router resolution, so this naming convention is what makes the
provider derivable here — a mechanism dependency, not a style choice
(spike finding, WORKLOG 2026-07-25).
"""

from __future__ import annotations

import base64
import json

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException
from litellm.integrations.custom_logger import CustomLogger

from kms import get_kms
from mogwai_common import (
    AUTHZ_PROJECTION_PREFIX,
    KEY_PROJECTION_PREFIX,
    get_redis,
)


class KeyResolver(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data: dict, call_type: str):
        user_id = user_api_key_dict.user_id
        if not user_id:
            raise HTTPException(status_code=401, detail="request carries no user identity")

        public_model: str = data.get("model", "")
        if "/" not in public_model:
            raise HTTPException(
                status_code=400,
                detail=f"model must be provider/model (tech-design §2.2), got {public_model!r}",
            )
        provider, model = public_model.split("/", 1)

        # -- 1. debt-clearing route (M4). Fail loudly, never silently skip. --
        raw_authz = await get_redis().get(AUTHZ_PROJECTION_PREFIX + user_id)
        if raw_authz is not None and json.loads(raw_authz).get("credits"):
            raise NotImplementedError(
                "key_resolver: debt-clearing routing lands with M4 settlement "
                "(tech-design §10.3); credits present but not yet routable"
            )

        # -- 2. BYOK ---------------------------------------------------------
        entry = await self._byok_entry(user_id, provider, model)
        if entry is None:
            # -- 3. platform pool is M4+; BYOK-only launch makes this a user error.
            raise HTTPException(
                status_code=400,
                detail=(
                    f"no hosted {provider} key covers model {model!r} "
                    "(launch is BYOK-only; host a key in the console first)"
                ),
            )

        dek = await get_kms().decrypt_dek(entry["encrypted_dek"])
        provider_key = (
            AESGCM(dek)
            .decrypt(
                base64.b64decode(entry["nonce"]),
                base64.b64decode(entry["ciphertext"]),
                None,
            )
            .decode()
        )

        data["api_key"] = provider_key  # used for this request only, never logged

        # /v1/messages 路由上 "metadata" 是 Anthropic API 自己的请求字段,
        # litellm 用 "litellm_metadata" 承载代理元数据;写错键的话元数据
        # 不会流到回调(usage_publisher 对此必填校验,测试锁定)。
        metadata_key = "litellm_metadata" if "litellm_metadata" in data else "metadata"
        metadata = data.setdefault(metadata_key, {}) or {}
        metadata["mogwai_key_source"] = "byok"
        metadata["mogwai_key_id"] = entry["key_id"]  # audit trail for billing
        data[metadata_key] = metadata
        return data

    async def _byok_entry(self, user_id: str, provider: str, model: str) -> dict | None:
        """First hosted key matching provider + whitelist (empty list = provider-wide)."""
        raw = await get_redis().get(KEY_PROJECTION_PREFIX + user_id)
        if raw is None:
            return None
        for entry in json.loads(raw):
            if entry["provider"] != provider:
                continue
            whitelist = entry.get("model_whitelist", [])
            if whitelist and model not in whitelist:
                continue
            return entry
        return None


key_resolver_instance = KeyResolver()
