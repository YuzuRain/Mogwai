"""Shared async Redis client for spike plugins (one connection pool per process)."""

import os

import redis.asyncio as aioredis

_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.Redis(
            host=os.environ["REDIS_HOST"],
            port=int(os.environ.get("REDIS_PORT", "6379")),
            decode_responses=True,
        )
    return _client
