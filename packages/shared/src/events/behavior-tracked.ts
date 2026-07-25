import { z } from "zod";
import { eventEnvelopeSchema } from "./envelope.js";

/** tech-design §4.2 行为事件清单(仅覆盖 Web 控制台;EV 主数据源是网关流量)。 */
export const behaviorTypeSchema = z.enum([
  "prompt.edited",
  "response.regenerated",
  "response.copied",
  "response.accepted",
  "session.duration",
  "tool.called",
  "rapid.fire",
]);

/**
 * behavior.tracked —— tracking-sdk / 控制台埋点 → telemetry 事件 API。
 * 信任边界(tech-design §4.2):行为事件是不可信输入,必须携带锚点
 * (真实调用的 request_id 或 langfuse_trace_id);telemetry 消费时与
 * usage.completed 交叉核验,无锚点或核验失败只进分析库、不进 EV 特征。
 */
export const behaviorTrackedSchema = eventEnvelopeSchema.extend({
  user_id: z.string().min(1),
  behavior_type: behaviorTypeSchema,
  anchor_request_id: z.string().nullable(),
  anchor_trace_id: z.string().nullable(),
  /** 事件附加属性(如 session.duration 的秒数);具体键由 behavior_type 决定。 */
  attrs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  /** 客户端本地时间,仅用于分析;结算一律以服务端接收时间为准。 */
  client_ts: z.iso.datetime({ offset: true }),
});

export type BehaviorTracked = z.infer<typeof behaviorTrackedSchema>;
