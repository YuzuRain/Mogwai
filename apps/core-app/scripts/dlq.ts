/**
 * billing DLQ 巡检与重放工具(tech-design §2.3)。
 *
 *   pnpm --filter @mogwai/core-app dlq list                       # 按原因汇总 + 逐条摘要
 *   pnpm --filter @mogwai/core-app dlq replay <stream_message_id> # 重放单条
 *   pnpm --filter @mogwai/core-app dlq replay --all               # 重放全部
 *
 * 重放 = 把原始 payload XADD 回 usage.completed 流并移出 DLQ:
 * 消费者按 (event_id, seq) 幂等,重复重放安全;根因(补价格/补用户)必须先修好,
 * 否则事件只会再次进 DLQ(工具会在输出里提示核对根因)。
 */
import { Redis } from "ioredis";

import { streamKey } from "@mogwai/shared";

const STREAM = streamKey("usage.completed");
const DLQ_KEY = "billing:dlq:usage.completed";

interface DlqEntry {
  reason: string;
  message: string;
  stream_message_id: string;
  fields: string[];
  ts: string;
}

async function readAll(redis: Redis): Promise<Array<{ raw: string; entry: DlqEntry }>> {
  const raws = await redis.lrange(DLQ_KEY, 0, -1);
  return raws.map((raw) => ({ raw, entry: JSON.parse(raw) as DlqEntry }));
}

export async function listDlq(redis: Redis): Promise<void> {
  const all = await readAll(redis);
  if (all.length === 0) {
    console.log("DLQ 为空。");
    return;
  }
  const byReason = new Map<string, number>();
  for (const { entry } of all) byReason.set(entry.reason, (byReason.get(entry.reason) ?? 0) + 1);
  console.log(`DLQ 深度 ${all.length},按原因:`);
  for (const [reason, count] of byReason) console.log(`  ${reason}: ${count}`);
  console.log("\n逐条(重放用 stream_message_id):");
  for (const { entry } of all) {
    console.log(`  [${entry.ts}] ${entry.stream_message_id} ${entry.reason} — ${entry.message}`);
  }
}

export async function replayDlq(redis: Redis, which: string): Promise<number> {
  const all = await readAll(redis);
  const targets = which === "--all" ? all : all.filter((e) => e.entry.stream_message_id === which);
  if (targets.length === 0) {
    throw new Error(`DLQ 中找不到 stream_message_id=${which}(用 'dlq list' 查看)`);
  }
  for (const { raw, entry } of targets) {
    const newId = await redis.xadd(STREAM, "*", ...entry.fields);
    // 先 XADD 后 LREM:中间崩溃的后果是「重放了但没出列」,重复重放由消费者幂等兜住
    await redis.lrem(DLQ_KEY, 1, raw);
    console.log(`重放 ${entry.stream_message_id} → ${newId}(原因曾是 ${entry.reason};确认根因已修复)`);
  }
  return targets.length;
}

const isMain = process.argv[1]?.endsWith("dlq.ts");
if (isMain) {
  const [cmd, arg] = process.argv.slice(2);
  const redis = new Redis(process.env.MOGWAI_REDIS_URL ?? "redis://localhost:6379/0");
  try {
    if (cmd === "list") {
      await listDlq(redis);
    } else if (cmd === "replay" && arg) {
      await replayDlq(redis, arg);
    } else {
      console.error("用法:dlq list | dlq replay <stream_message_id> | dlq replay --all");
      process.exitCode = 2;
    }
  } finally {
    redis.disconnect();
  }
}
