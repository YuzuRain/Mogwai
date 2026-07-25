import { z } from "zod";

/**
 * 所有领域事件的公共信封(architecture A5):
 * - event_id 是幂等键,消费者各自去重;
 * - schema_version 供消费者做向后兼容(兼容一版)。
 * 事件字段与信封平铺在同一层(见 tech-design §2.3 的 usage.completed 示例)。
 */
export const eventEnvelopeSchema = z.object({
  schema_version: z.number().int().positive(),
  event_id: z.uuid(),
  ts: z.iso.datetime({ offset: true }),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
