"""Shared runtime for the mogwai gateway plugins.

Responsibilities kept deliberately small (architecture A4: plugins stay thin,
no business rules):

- one async Redis connection pool per process;
- environment-driven configuration, resolved once at import time;
- Redis key/stream naming, mirroring the authoritative definitions in
  ``packages/shared`` (projections/*.ts, events/topics.ts). If a name changes
  there, it must change here in the same commit.

Environment variables (all optional defaults are dev-only):

===================  =========================================================
MOGWAI_REDIS_URL     redis connection url, default ``redis://redis:6379/0``
MOGWAI_SCHEMA_DIR    directory holding the JSON Schema artifacts exported from
                     packages/shared, default ``/app/schemas``
MOGWAI_SPOOL_PATH    JSONL spool file for usage events that could not be
                     published, default ``/var/lib/mogwai/usage-spool.jsonl``
===================  =========================================================
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

import redis.asyncio as aioredis

# --- Naming contracts (single source of truth: packages/shared) -------------

TOKEN_PROJECTION_PREFIX = "proj:token:"  # projections/token.ts
KEY_PROJECTION_PREFIX = "proj:keys:"  # projections/key-routing.ts
AUTHZ_PROJECTION_PREFIX = "proj:authz:"  # projections/authorization.ts
USAGE_STREAM = "events:usage.completed"  # events/topics.ts streamKey()

# --- Configuration -----------------------------------------------------------

REDIS_URL = os.environ.get("MOGWAI_REDIS_URL", "redis://redis:6379/0")
SCHEMA_DIR = Path(os.environ.get("MOGWAI_SCHEMA_DIR", "/app/schemas"))
SPOOL_PATH = Path(
    os.environ.get("MOGWAI_SPOOL_PATH", "/var/lib/mogwai/usage-spool.jsonl")
)

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    """Process-wide async Redis client (decode_responses: projections are text)."""
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis


@lru_cache(maxsize=8)
def load_json_schema(relative_path: str) -> dict:
    """Load a JSON Schema artifact exported by ``pnpm export:schemas``.

    Fails loudly if the artifact is missing: running a gateway without its
    contract artifacts is a deployment error, never something to paper over.
    """
    path = SCHEMA_DIR / relative_path
    if not path.is_file():
        raise FileNotFoundError(
            f"contract artifact missing: {path} — build the image after "
            "running `pnpm export:schemas` (see gateway/README.md)"
        )
    return json.loads(path.read_text())
