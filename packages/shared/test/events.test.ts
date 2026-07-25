import { describe, expect, it } from "vitest";
import {
  EVENT_TOPICS,
  battleFinishedSchema,
  eventSchemas,
  settlementDoneSchema,
  streamKey,
  usageCompletedSchema,
} from "../src/index.js";

/** test/litellm-spike 网关端到端跑出的真实事件原样(2026-07-25),防契约漂移。 */
const spikeCapturedUsageEvent = {
  schema_version: 1,
  event_id: "0ede10bd-e1e5-4aca-8729-d14fe5c380f1",
  user_id: "u_spike_1",
  request_id: "d7b943c6-6fed-4475-8375-b3cf5c3dd4bf",
  provider: "openai",
  model: "gpt-3.5-turbo",
  key_source: "byok",
  input_tokens: 42,
  output_tokens: 7,
  cached_tokens: 0,
  latency_ms: 334,
  status: "ok",
  langfuse_trace_id: null,
  ts: "2026-07-25T16:01:41.889061+00:00",
};

describe("usage.completed", () => {
  it("accepts the real event captured from the litellm spike", () => {
    const parsed = usageCompletedSchema.parse(spikeCapturedUsageEvent);
    expect(parsed.user_id).toBe("u_spike_1");
    expect(parsed.estimated).toBe(false); // default fills when gateway omits it
  });

  it("rejects unknown status and key_source", () => {
    expect(
      usageCompletedSchema.safeParse({ ...spikeCapturedUsageEvent, status: "partial" }).success,
    ).toBe(false);
    expect(
      usageCompletedSchema.safeParse({ ...spikeCapturedUsageEvent, key_source: "shared" }).success,
    ).toBe(false);
  });

  it("rejects negative token counts", () => {
    expect(
      usageCompletedSchema.safeParse({ ...spikeCapturedUsageEvent, input_tokens: -1 }).success,
    ).toBe(false);
  });
});

describe("event registry", () => {
  it("covers exactly the seven topics of architecture A5", () => {
    expect(EVENT_TOPICS.sort()).toEqual(
      [
        "usage.completed",
        "behavior.tracked",
        "ev.settled",
        "ev.report.generated",
        "trainer.levelup",
        "battle.finished",
        "settlement.done",
      ].sort(),
    );
  });

  it("every schema requires the idempotency envelope", () => {
    for (const [topic, schema] of Object.entries(eventSchemas)) {
      const result = schema.safeParse({ schema_version: 1, ts: "2026-07-25T00:00:00Z" });
      expect(result.success, `${topic} must require event_id`).toBe(false);
    }
  });

  it("maps topics to namespaced stream keys", () => {
    expect(streamKey("usage.completed")).toBe("events:usage.completed");
  });
});

describe("battle.finished / settlement.done", () => {
  const envelope = {
    schema_version: 1,
    event_id: "7f6a2f6e-93e8-4a3b-9a70-1d2b3c4d5e6f",
    ts: "2026-07-25T00:00:00+08:00",
  };

  it("allows a draw (null winner)", () => {
    const parsed = battleFinishedSchema.parse({
      ...envelope,
      battle_id: "b_1",
      trainer_a: "t_1",
      trainer_b: "t_2",
      winner_trainer_id: null,
      reason: "turn_limit",
      turns: 50,
    });
    expect(parsed.winner_trainer_id).toBeNull();
  });

  it("requires at least one ledger entry", () => {
    const result = settlementDoneSchema.safeParse({
      ...envelope,
      battle_id: "b_1",
      winner_user_id: "u_1",
      loser_user_id: "u_2",
      debt_cp: 100,
      ledger_entry_ids: [],
    });
    expect(result.success).toBe(false);
  });
});
