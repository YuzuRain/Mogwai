"""Local spool for usage events that failed to publish (tech-design §2.3).

``usage.completed`` is the sole billing source and must never be lost
silently. When XADD fails (Redis down/partitioned), the event is appended to
a local JSONL file; every later successful publish attempts to drain the
spool. Downstream consumers dedupe on ``event_id``, so re-delivery is safe.

Standalone module (no litellm imports) so the durability logic is testable
against a real Redis on its own.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import redis.asyncio as aioredis

# print 在 litellm 容器里会被 stdout 缓冲吞掉(2026-07-27 调试实证);
# logging 的 ERROR 级别经 lastResort handler 直达 stderr,容器日志可见。
logger = logging.getLogger("mogwai.gateway.spool")


class UsageSpool:
    def __init__(self, stream: str, path: Path) -> None:
        self._stream = stream
        self._path = path

    async def publish_or_spool(self, redis_client: aioredis.Redis, event: dict) -> bool:
        """XADD the event; on connection failure append it to the spool.

        Returns True when the event reached Redis. Never raises on publish
        failure — losing the callback would lose the event for good, the spool
        IS the error path.
        """
        try:
            await redis_client.xadd(self._stream, {"payload": json.dumps(event)})
        except (aioredis.RedisError, OSError) as exc:
            self._append(event)
            logger.error(
                "spool: XADD to %s failed (%r); event %s spooled to %s",
                self._stream,
                exc,
                event.get("event_id"),
                self._path,
            )
            return False
        await self.drain(redis_client)
        return True

    async def drain(self, redis_client: aioredis.Redis) -> int:
        """Re-publish spooled events; keep whatever still fails. Returns count sent."""
        if not self._path.is_file() or self._path.stat().st_size == 0:
            return 0
        lines = self._path.read_text().splitlines()
        remaining: list[str] = []
        sent = 0
        for line in lines:
            if not line.strip():
                continue
            try:
                await redis_client.xadd(self._stream, {"payload": line})
                sent += 1
            except (aioredis.RedisError, OSError):
                remaining.append(line)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text("\n".join(remaining) + ("\n" if remaining else ""))
        os.replace(tmp, self._path)  # atomic swap, no partial spool on crash
        if sent:
            logger.warning(
                "spool: re-published %d spooled event(s) to %s, %d still pending",
                sent,
                self._stream,
                len(remaining),
            )
        return sent

    def _append(self, event: dict) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a") as fh:
            fh.write(json.dumps(event) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
