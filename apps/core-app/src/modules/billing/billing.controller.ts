import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { and, desc, eq, lt, sql, type SQL } from "drizzle-orm";

import {
  ledgerEntryViewSchema,
  ledgerQuerySchema,
  paginatedSchema,
  positionsResponseSchema,
} from "@mogwai/shared";

import { SessionGuard, type AuthedRequest } from "../../auth/session.guard.js";
import { parseRequest, toDto } from "../../common/zod.js";
import { DB, type Db } from "../../infra/db.module.js";
import { users } from "../account/schema.js";
import { ledgerEntries } from "./schema.js";

/** billing 管理面(B4.1):净头寸 + 分录流水。账本只读,写入只发生在消费者。 */
@Controller("api/v1/billing")
@UseGuards(SessionGuard)
export class BillingController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get("positions")
  async positions(@Req() req: AuthedRequest) {
    const nets = await this.db
      .select({
        account: ledgerEntries.account,
        net: sql<string>`sum(${ledgerEntries.deltaCp})`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, req.userId))
      .groupBy(ledgerEntries.account);
    const net = (account: string) => Number(nets.find((n) => n.account === account)?.net ?? 0);

    const [user] = await this.db
      .select({ pledgeLimitCp: users.pledgeLimitCp })
      .from(users)
      .where(eq(users.id, req.userId));

    return toDto(positionsResponseSchema, {
      positions: {
        pledge: net("pledge"),
        debt: net("debt"),
        service_fee: net("service_fee"),
      },
      pledge_available_cp: Number(user?.pledgeLimitCp ?? 0n) - net("pledge"),
    });
  }

  @Get("ledger")
  async ledger(@Req() req: AuthedRequest, @Query() query: unknown) {
    const { cursor, limit, account } = parseRequest(ledgerQuerySchema, query);
    // keyset 分页:id 为 bigserial,单调递增,游标即上一页最后一条的 id
    const conditions: SQL[] = [eq(ledgerEntries.userId, req.userId)];
    if (account) conditions.push(eq(ledgerEntries.account, account));
    if (cursor !== undefined) {
      if (!/^\d+$/.test(cursor)) {
        conditions.push(sql`false`); // 非法游标 → 空页,parseRequest 已保证非空串
      } else {
        conditions.push(lt(ledgerEntries.id, BigInt(cursor)));
      }
    }

    const rows = await this.db
      .select()
      .from(ledgerEntries)
      .where(and(...conditions))
      .orderBy(desc(ledgerEntries.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    return toDto(paginatedSchema(ledgerEntryViewSchema), {
      items: page.map((row) => ({
        id: row.id.toString(),
        txn_id: row.txnId,
        event_id: row.eventId,
        seq: row.seq,
        account: row.account,
        counterparty_id: row.counterpartyId,
        delta_cp: Number(row.deltaCp),
        reason: row.reason,
        ref_type: row.refType,
        ref_id: row.refId,
        formula_version: row.formulaVersion,
        snapshot: row.snapshot,
        created_at: row.createdAt.toISOString(),
      })),
      next_cursor: rows.length > limit ? page[page.length - 1]!.id.toString() : null,
    });
  }
}
