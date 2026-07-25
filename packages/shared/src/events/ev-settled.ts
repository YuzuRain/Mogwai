import { z } from "zod";
import { eventEnvelopeSchema } from "./envelope.js";
import { statBlockSchema } from "../game/stat-block.js";

/**
 * ev.settled —— game.ev worker 每日结算完成(tech-design §5.2)。
 * 消费者:game 面板重算 / game.report。
 * 特征贡献明细不进事件(体积大),由 report 域从 ClickHouse 读取;
 * M2 game 模块设计时如需扩展,走 schema_version 升版。
 */
export const evSettledSchema = eventEnvelopeSchema.extend({
  trainer_id: z.string().min(1),
  /** 结算日(UTC+8 自然日,tech-design §5.2),格式 YYYY-MM-DD。 */
  date: z.iso.date(),
  deltas: statBlockSchema,
  totals: statBlockSchema,
  weight_version: z.string().min(1),
});

export type EvSettled = z.infer<typeof evSettledSchema>;
