import { z } from "zod";

import { ledgerAccountSchema } from "../domain/ledger.js";
import { paginationQuerySchema } from "./common.js";

/** billing 模块管理面 DTO(architecture B4.1;口径见 tech-design §3.5)。 */

export const positionsResponseSchema = z.object({
  /** 各科目净头寸(该用户所有分录之和);正负语义见 §3.5 科目表。 */
  positions: z.object({
    pledge: z.number().int(),
    debt: z.number().int(),
    service_fee: z.number().int(),
  }),
  /** 可用担保额度 = pledge_limit_cp − pledge 净头寸。 */
  pledge_available_cp: z.number().int(),
});
export type PositionsResponse = z.infer<typeof positionsResponseSchema>;

export const ledgerQuerySchema = paginationQuerySchema.extend({
  account: ledgerAccountSchema.optional(),
});

/** 分录视图:含合约化字段(formula_version/snapshot),支撑逐笔折算追溯。 */
export const ledgerEntryViewSchema = z.object({
  id: z.string().min(1),
  txn_id: z.uuid(),
  event_id: z.uuid(),
  seq: z.number().int().nonnegative(),
  account: ledgerAccountSchema,
  counterparty_id: z.string().min(1),
  delta_cp: z.number().int(),
  reason: z.string().min(1),
  ref_type: z.string().nullable(),
  ref_id: z.string().nullable(),
  formula_version: z.string().nullable(),
  snapshot: z.unknown().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
export type LedgerEntryView = z.infer<typeof ledgerEntryViewSchema>;
