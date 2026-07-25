import { z } from "zod";
import { eventEnvelopeSchema } from "./envelope.js";
import { statKeySchema } from "../game/stat-block.js";

/** 单条归因:Δev 按 w[i][j]·feature_norm[j] 分解的 top 贡献(tech-design §5.4)。 */
export const evAttributionSchema = z.object({
  stat: statKeySchema,
  delta: z.number().int(),
  feature: z.string().min(1),
  /** 前端按 feature → 模板渲染文案;后端只出结构化参数(便于 i18n)。 */
  narrative_params: z.record(z.string(), z.union([z.string(), z.number()])),
});

/**
 * ev.report.generated —— game.report 生成 EV 日报(tech-design §5.4 ev_daily_report)。
 * 消费者:realtime(日报通知)。
 */
export const evReportGeneratedSchema = eventEnvelopeSchema.extend({
  trainer_id: z.string().min(1),
  date: z.iso.date(),
  deltas: z.partialRecord(statKeySchema, z.number().int()),
  attributions: z.array(evAttributionSchema),
  /** 风格画像变化(周对比),无变化为 null。 */
  style_shift: z.string().nullable(),
  weight_version: z.string().min(1),
});

export type EvReportGenerated = z.infer<typeof evReportGeneratedSchema>;
