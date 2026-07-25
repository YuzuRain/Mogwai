import { z } from "zod";
import { eventEnvelopeSchema } from "./envelope.js";

/**
 * usage.completed —— 网关唯一出口事件,计费/EXP/EV/实时反馈四个下游各自消费。
 * 字段为 tech-design §2.3 的权威定义;网关不知晓任何游戏概念,只含账户概念 user_id。
 */
export const usageCompletedSchema = eventEnvelopeSchema.extend({
  user_id: z.string().min(1),
  request_id: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  key_source: z.enum(["byok", "platform"]),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cached_tokens: z.number().int().nonnegative(),
  latency_ms: z.number().int().nonnegative(),
  status: z.enum(["ok", "error", "timeout"]),
  /** provider 未返回 usage、由 tokenizer 本地估算时为 true(tech-design §2.2)。 */
  estimated: z.boolean().default(false),
  langfuse_trace_id: z.string().nullable(),
});

export type UsageCompleted = z.infer<typeof usageCompletedSchema>;
