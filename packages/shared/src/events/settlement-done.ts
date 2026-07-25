import { z } from "zod";
import { eventEnvelopeSchema } from "./envelope.js";

/**
 * settlement.done —— billing.ledger 完成一场对战的记账(tech-design §10.2)。
 * 消费者:realtime / match(排行榜)。
 * 纯记账制:败方对胜方背负 debt_cp 债务(平台不抽成),担保额度解锁;
 * 后续实物冲销(§10.3)体现在账本,不再发领域事件。
 */
export const settlementDoneSchema = eventEnvelopeSchema.extend({
  battle_id: z.string().min(1),
  winner_user_id: z.string().min(1),
  loser_user_id: z.string().min(1),
  /** 败方新增债务(CP);平局为 0。 */
  debt_cp: z.number().int().nonnegative(),
  /** 本次结算写入的账本分录 id(复式记账,双向可审计)。 */
  ledger_entry_ids: z.array(z.string().min(1)).min(1),
});

export type SettlementDone = z.infer<typeof settlementDoneSchema>;
