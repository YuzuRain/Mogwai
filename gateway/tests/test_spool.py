"""Durability tests for the usage spool, against a real Redis.

usage.completed is the sole billing source (tech-design §2.3): when Redis is
unreachable the event must land in the spool, and a later successful publish
must drain it back into the stream.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from pathlib import Path

import redis.asyncio as aioredis

sys.path.insert(0, "/gateway-plugins")
from spool import UsageSpool  # noqa: E402

STREAM = f"test:spool:{uuid.uuid4().hex[:8]}"


def _event() -> dict:
    return {"event_id": str(uuid.uuid4()), "user_id": "u_spool", "schema_version": 1}


def test_publish_failure_spools_then_drains(tmp_path: Path):
    spool_file = tmp_path / "usage-spool.jsonl"
    spool = UsageSpool(STREAM, spool_file)

    unreachable = aioredis.from_url(
        "redis://127.0.0.1:1", socket_connect_timeout=0.2, decode_responses=True
    )
    reachable = aioredis.from_url(os.environ["REDIS_URL"], decode_responses=True)

    async def scenario() -> tuple[bool, bool, int]:
        first, second = _event(), _event()
        ok_first = await spool.publish_or_spool(unreachable, first)
        spooled = spool_file.read_text()
        assert first["event_id"] in spooled, "failed publish must be spooled"

        ok_second = await spool.publish_or_spool(reachable, second)
        entries = await reachable.xrange(STREAM)
        await reachable.aclose()
        await unreachable.aclose()
        return ok_first, ok_second, len(entries)

    ok_first, ok_second, count = asyncio.run(scenario())
    assert ok_first is False
    assert ok_second is True
    assert count == 2, "drain must re-publish the spooled event alongside the new one"
    assert spool_file.read_text().strip() == "", "spool must be empty after drain"


def test_drain_preserves_event_payload(tmp_path: Path):
    spool_file = tmp_path / "spool.jsonl"
    spool = UsageSpool(STREAM + ":payload", spool_file)
    original = _event()
    spool_file.write_text(json.dumps(original) + "\n")

    reachable = aioredis.from_url(os.environ["REDIS_URL"], decode_responses=True)

    async def scenario() -> dict:
        sent = await spool.drain(reachable)
        assert sent == 1
        entries = await reachable.xrange(STREAM + ":payload")
        await reachable.aclose()
        return json.loads(entries[0][1]["payload"])

    replayed = asyncio.run(scenario())
    assert replayed == original
