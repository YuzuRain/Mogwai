import { z } from "zod";
import { eventEnvelopeSchema } from "./envelope.js";

/**
 * trainer.levelup —— game.exp 结算 EXP 触发升级(tech-design §6.3)。
 * 消费者:game.gacha(发抽卡券)/ realtime。
 * 一次事件可跨多级(大量 EXP 一次入账),抽卡券数由 game.gacha 按等级规则决定。
 */
export const trainerLevelupSchema = eventEnvelopeSchema.extend({
  trainer_id: z.string().min(1),
  from_level: z.number().int().positive(),
  to_level: z.number().int().positive(),
  /** 升级后的累计 EXP(BIGINT,超出 JS 安全整数范围前由 game 域负责升版为 string)。 */
  total_exp: z.number().int().nonnegative(),
});

export type TrainerLevelup = z.infer<typeof trainerLevelupSchema>;
