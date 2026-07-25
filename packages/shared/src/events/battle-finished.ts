import { z } from "zod";
import { eventEnvelopeSchema } from "./envelope.js";

/**
 * battle.finished —— battle.engine 战果落库后发布(architecture B5.2)。
 * 消费者:battle.settle(按对战合约幂等结算)/ battle.analysis / match(评分更新)。
 * 结算所需的全部参数在 battles.contract(合约化,tech-design §1.5),
 * 事件只携带引用,消费者回读合约执行——不回读配置中心。
 */
export const battleFinishedSchema = eventEnvelopeSchema.extend({
  battle_id: z.string().min(1),
  trainer_a: z.string().min(1),
  trainer_b: z.string().min(1),
  /** 平局(双方同回合倒下/达到回合上限判定)为 null,结算按合约的平局条款。 */
  winner_trainer_id: z.string().nullable(),
  /** 结束原因;取值集合由 battle-core 在 M3 模块设计时收敛,先按开放字符串。 */
  reason: z.string().min(1),
  turns: z.number().int().positive(),
});

export type BattleFinished = z.infer<typeof battleFinishedSchema>;
