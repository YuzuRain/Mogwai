import type { z } from "zod";
import { usageCompletedSchema } from "./usage-completed.js";
import { behaviorTrackedSchema } from "./behavior-tracked.js";
import { evSettledSchema } from "./ev-settled.js";
import { evReportGeneratedSchema } from "./ev-report-generated.js";
import { trainerLevelupSchema } from "./trainer-levelup.js";
import { battleFinishedSchema } from "./battle-finished.js";
import { settlementDoneSchema } from "./settlement-done.js";

/** 事件契约注册表(architecture A5 全表)。topic → 权威 schema。 */
export const eventSchemas = {
  "usage.completed": usageCompletedSchema,
  "behavior.tracked": behaviorTrackedSchema,
  "ev.settled": evSettledSchema,
  "ev.report.generated": evReportGeneratedSchema,
  "trainer.levelup": trainerLevelupSchema,
  "battle.finished": battleFinishedSchema,
  "settlement.done": settlementDoneSchema,
} as const;

export type EventTopic = keyof typeof eventSchemas;

export const EVENT_TOPICS = Object.keys(eventSchemas) as EventTopic[];

export type EventPayload<T extends EventTopic> = z.infer<(typeof eventSchemas)[T]>;

/** Redis Stream 命名约定:`events:<topic>`(与网关 usage_publisher 一致)。 */
export function streamKey(topic: EventTopic): string {
  return `events:${topic}`;
}
