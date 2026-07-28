import { LEDGER_ACCOUNTS } from "@mogwai/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "../account/schema.js";

/**
 * billing 模块:复式账本(tech-design §3.5 记账模型)。
 *
 * 结构性约束在迁移里(0001_ledger_constraints.sql,drizzle 表达不了):
 * - 每 txn Σdelta_cp = 0(延迟约束触发器,提交时校验);
 * - 每 txn ≥ 2 条分录;
 * - UPDATE / DELETE 直接拒绝(只增不改,更正走冲销 txn)。
 *
 * 科目枚举单一权威在 @mogwai/shared(domain/ledger.ts)。
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** 一个经济事实 = 一个 txn(≥2 条分录,和为 0)。 */
    txnId: uuid("txn_id").notNull(),
    /** 源事件(usage.completed / battle.finished…);(event_id, seq) 为幂等键。 */
    eventId: uuid("event_id").notNull(),
    seq: smallint("seq").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** 关系型科目,双方同科目反符号(§3.5 科目表)。 */
    account: text("account").notNull(),
    counterpartyId: text("counterparty_id")
      .notNull()
      .references(() => users.id),
    deltaCp: bigint("delta_cp", { mode: "bigint" }).notNull(),
    reason: text("reason").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    /** 合约化字段(§1.5):计费类 txn 必带,应用层保证。 */
    formulaVersion: text("formula_version"),
    snapshot: jsonb("snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_event_seq_uq").on(t.eventId, t.seq),
    index("ledger_txn_idx").on(t.txnId),
    index("ledger_user_account_idx").on(t.userId, t.account),
    // 与 shared LEDGER_ACCOUNTS 同源构造,渲染文本与既有迁移一致(不产生 ALTER)
    check(
      "ledger_account_check",
      sql`${t.account} in (${sql.raw(LEDGER_ACCOUNTS.map((a) => `'${a}'`).join(", "))})`,
    ),
    check("ledger_delta_nonzero", sql`${t.deltaCp} <> 0`),
  ],
);
