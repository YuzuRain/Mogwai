"""custom_auth hook: platform token -> Redis token projection -> user identity.

Spike counterpart of architecture.md A4 platform_auth. Proves the gateway can
authenticate platform-issued tokens against a Redis projection without touching
PostgreSQL.
"""

import hashlib

from fastapi import Request
from litellm.proxy._types import UserAPIKeyAuth

from spike_redis import get_redis

TOKEN_PROJECTION_PREFIX = "proj:token:"


async def user_api_key_auth(request: Request, api_key: str) -> UserAPIKeyAuth:
    token_hash = hashlib.sha256(api_key.encode()).hexdigest()
    projection = await get_redis().hgetall(TOKEN_PROJECTION_PREFIX + token_hash)

    if not projection:
        raise Exception(f"platform_auth: unknown platform token (hash={token_hash[:12]}...)")
    if projection.get("blocked") == "1":
        raise Exception("platform_auth: token is blocked by billing rejection flag")

    return UserAPIKeyAuth(
        api_key=api_key,
        user_id=projection["user_id"],
        metadata={"privacy_mode": projection.get("privacy_mode", "0")},
    )
