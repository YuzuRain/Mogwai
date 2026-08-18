import { Inject, Injectable, Logger } from "@nestjs/common";
import { inArray } from "drizzle-orm";
import type { Redis } from "ioredis";

import { streamKey } from "@mogwai/shared";

import { DB, type Db } from "../../infra/db.module.js";
import { REDIS } from "../../infra/redis.module.js";
import { BILLING_DLQ_KEY, BillingConsumer } from "./consumer.js";
import { ledgerEntries } from "./schema.js";

const STREAM = streamKey("usage.completed");
/** 尾部宽限:消费者在途/退避重试中的消息不算差异。 */
const DEFAULT_GRACE_MS = 5 * 60_000;

export interface ReconcileReport {
  scanned: number;
  in_ledger: number;
  in_dlq: number;
  /** 差异事件:补记后真的产生了分录或进了 DLQ(真实漏账,须告警)。 */
  healed_billed: number;
  healed_dlq: number;
  /** 补记后仍无分录:零成本调用,非差异。 */
  zero_cost: number;
  dlq_depth: number;
}

/**
 * 每日对账,M1 范围 = stream ↔ ledger 自对账(tech-design §2.3):
 * usage.completed 是计费唯一来源且 stream 未裁剪,窗口内每个事件必须
 * 「在账本 ∨ 在 DLQ ∨ 零成本」,否则即为漏账 → 走消费者同一记账入口幂等补记 + 告警。
 * 与网关侧独立数据源(LiteLLM spend log)的比对待 REVIEW Block 16 裁定后叠加。
 */
@Injectable()
export class BillingReconciler {
  private readonly logger = new Logger("BillingReconciler");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(BillingConsumer) private readonly consumer: BillingConsumer,
  ) {}

  /** windowMs 默认 26h:与每日调度重叠 2h,连续两窗覆盖无缝隙。 */
  async reconcile(windowMs = 26 * 3600_000, graceMs = DEFAULT_GRACE_MS): Promise<ReconcileReport> {
    const report: ReconcileReport = {
      scanned: 0,
      in_ledger: 0,
      in_dlq: 0,
      healed_billed: 0,
      healed_dlq: 0,
      zero_cost: 0,
      dlq_depth: 0,
    };

    // DLQ 里的事件已被显式处理(等人工重放),不算漏账
    const dlqRaw = await this.redis.lrange(BILLING_DLQ_KEY, 0, -1);
    report.dlq_depth = dlqRaw.length;
    const dlqMessageIds = new Set<string>();
    for (const raw of dlqRaw) {
      const entry = JSON.parse(raw) as { stream_message_id?: string };
      if (entry.stream_message_id) dlqMessageIds.add(entry.stream_message_id);
    }

    // 窗口以 Redis 服务器时钟为基准:stream ID 由 Redis 分配,
    // 用宿主机时钟算窗口会在时钟漂移时漏扫(本地 VM 睡眠、生产 NTP 偏差同理)
    const [sec, usec] = (await this.redis.time()) as [string, string];
    const serverNowMs = Number(sec) * 1000 + Math.floor(Number(usec) / 1000);
    const endId = `${serverNowMs - graceMs}-0`;
    let cursor = `${serverNowMs - windowMs}-0`;
    for (;;) {
      const batch = (await this.redis.xrange(STREAM, cursor, endId, "COUNT", 500)) as Array<
        [string, string[]]
      >;
      if (batch.length === 0) break;

      // 批内解析 event_id → 批量查账本(无法解析的消息按 stream_message_id 对 DLQ)
      const parsed: Array<{ messageId: string; eventId: string | null; fields: string[] }> = [];
      for (const [messageId, fields] of batch) {
        const payloadIdx = fields.indexOf("payload");
        let eventId: string | null = null;
        try {
          const payload = JSON.parse(fields[payloadIdx + 1]!) as { event_id?: string };
          eventId = typeof payload.event_id === "string" ? payload.event_id : null;
        } catch {
          // 解析失败的消息若不在 DLQ,下方补记会把它送进 DLQ(schema_violation)
        }
        parsed.push({ messageId, eventId, fields });
      }
      report.scanned += parsed.length;

      const eventIds = parsed.map((p) => p.eventId).filter((id): id is string => id !== null);
      const billedRows = eventIds.length
        ? await this.db
            .selectDistinct({ eventId: ledgerEntries.eventId })
            .from(ledgerEntries)
            .where(inArray(ledgerEntries.eventId, eventIds))
        : [];
      const billed = new Set(billedRows.map((r) => r.eventId));

      for (const { messageId, eventId, fields } of parsed) {
        if (eventId !== null && billed.has(eventId)) {
          report.in_ledger += 1;
          continue;
        }
        if (dlqMessageIds.has(messageId)) {
          report.in_dlq += 1;
          continue;
        }
        // 差异候选:幂等补记(与消费循环同一入口),再按结果分类
        const outcome = await this.consumer.bill(fields, messageId);
        if (outcome === "duplicate") {
          report.in_ledger += 1; // 与消费者赛跑,已被记上
        } else if (outcome === "dlq") {
          report.healed_dlq += 1;
          report.dlq_depth += 1;
        } else if (eventId !== null && (await this.hasLedgerRows(eventId))) {
          report.healed_billed += 1;
          this.logger.error(`reconcile: event ${eventId} was missing from ledger — healed by re-billing`);
        } else {
          report.zero_cost += 1;
        }
      }

      cursor = nextStreamId(batch[batch.length - 1]![0]);
    }

    const healed = report.healed_billed + report.healed_dlq;
    if (healed > 0) {
      this.logger.error(
        `reconcile: ${healed} event(s) had slipped through consumption (billed ${report.healed_billed}, dlq ${report.healed_dlq}) — check consumer health`,
      );
    }
    if (report.dlq_depth > 0) {
      this.logger.error(
        `reconcile: DLQ depth ${report.dlq_depth} — inspect and replay via 'pnpm --filter @mogwai/core-app dlq list'`,
      );
    }
    this.logger.log(`reconcile report: ${JSON.stringify(report)}`);
    return report;
  }

  private async hasLedgerRows(eventId: string): Promise<boolean> {
    const rows = await this.db
      .selectDistinct({ eventId: ledgerEntries.eventId })
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.eventId, [eventId]));
    return rows.length > 0;
  }
}

/** XRANGE 起点排他化:同 ms 内的下一条是 seq+1。 */
function nextStreamId(id: string): string {
  const [ms, seq] = id.split("-");
  return `${ms}-${Number(seq) + 1}`;
}
