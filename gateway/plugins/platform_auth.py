"""custom_auth hook: platform token -> identity + soft authorization pre-check.

Flow (tech-design §2.5, architecture A4):

1. sha256 the presented platform token, read the token projection
   (written by account on token issuance; the gateway never touches Postgres);
2. unknown token -> 401; token-level rejection flag -> 403;
3. soft pre-check against the authorization projection: billing pre-computes
   the verdict (``blocked``) from fee debt thresholds — the gateway only reads
   flags, business rules stay in billing -> 402 when blocked;
4. attach user_id + privacy_mode for downstream hooks/callbacks.

The projections are eventually-consistent by design; the authoritative ledger
reconciles any overshoot afterwards (§2.5 "投影是近似值").
"""

from __future__ import annotations

import hashlib
import json

from fastapi import HTTPException, Request
from litellm.proxy._types import UserAPIKeyAuth

from mogwai_common import (
    AUTHZ_PROJECTION_PREFIX,
    TOKEN_PROJECTION_PREFIX,
    get_redis,
)


async def user_api_key_auth(request: Request, api_key: str) -> UserAPIKeyAuth:
    token_hash = hashlib.sha256(api_key.encode()).hexdigest()
    projection = await get_redis().hgetall(TOKEN_PROJECTION_PREFIX + token_hash)

    if not projection:
        raise HTTPException(
            status_code=401,
            detail=f"unknown platform token (hash={token_hash[:12]}…)",
        )
    if projection.get("blocked") == "1":
        raise HTTPException(status_code=403, detail="platform token is blocked")

    # 必填字段缺失 = account 写入的投影损坏,必须响亮失败:
    # 尤其 privacy_mode,静默默认成「非隐私」是隐私违规,不是降级。
    try:
        user_id = projection["user_id"]
        privacy_mode = projection["privacy_mode"]
    except KeyError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"token projection for hash={token_hash[:12]}… is corrupt: missing {exc}",
        ) from exc

    raw_authz = await get_redis().get(AUTHZ_PROJECTION_PREFIX + user_id)
    if raw_authz is not None and json.loads(raw_authz).get("blocked") is True:
        # Verdict computed by billing (fee debt over threshold); we only relay it.
        raise HTTPException(
            status_code=402,
            detail="account blocked by billing (outstanding service fees)",
        )

    return UserAPIKeyAuth(
        api_key=api_key,
        user_id=user_id,
        metadata={"privacy_mode": privacy_mode},
    )
