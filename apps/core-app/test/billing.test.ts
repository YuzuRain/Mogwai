/**
 * billing 模块集成测试——真实 Postgres + Redis + 完整 Nest 应用 + 真跑消费者
 * (no-mocks 规则,事件直接 XADD 进真实 stream,与网关发布格式一致)。
 *
 * 覆盖:事件→公式求值→复式记账全链路、(event_id, seq) 幂等、
 * 业务性坏事件进 DLQ 且消费不中断、授权投影刷新、positions/ledger 端点与 keyset 分页。
 */
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Redis } from "ioredis";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  authorizationProjectionKey,
  authorizationProjectionSchema,
  ledgerEntryViewSchema,
  paginatedSchema,
  PLATFORM_USER_ID,
  positionsResponseSchema,
  streamKey,
} from "@mogwai/shared";

const ADMIN_URL =
  process.env.DATABASE_URL ?? "postgres://mogwai:mogwai_dev@localhost:5432/mogwai";
const TEST_DB = "mogwai_test_billing";
const TEST_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB}`);
const REDIS_URL = "redis://localhost:6379/4";
const STREAM = streamKey("usage.completed");
const DLQ_KEY = "billing:dlq:usage.completed";

let app: import("@nestjs/common").INestApplication;
let consumerDone: Promise<void>;
let baseUrl: string;
let redis: Redis;
let pool: Pool;
let cookie: string;
let userId: string;

async function api(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { cookie } });
}

/** 与 gateway usage_publisher 相同的发布格式:XADD stream payload=<json>。 */
async function publish(overrides: Record<string, unknown> = {}): Promise<string> {
  const event = {
    schema_version: 1,
    event_id: randomUUID(),
    ts: new Date().toISOString(),
    user_id: userId,
    request_id: `req-${randomUUID()}`,
    provider: "openai",
    model: "gpt-5",
    key_source: "byok",
    input_tokens: 1_000_000,
    output_tokens: 500_000,
    cached_tokens: 0,
    latency_ms: 1200,
    status: "ok",
    estimated: false,
    langfuse_trace_id: null,
    ...overrides,
  };
  await redis.xadd(STREAM, "*", "payload", JSON.stringify(event));
  return event.event_id as string;
}

async function until<T>(fn: () => Promise<T | undefined>, what: string, ms = 5000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function ledgerRowsByEvent(eventId: string): Promise<Array<Record<string, unknown>>> {
  const { rows } = await pool.query("select * from ledger_entries where event_id = $1 order by seq", [
    eventId,
  ]);
  return rows;
}

beforeAll(async () => {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  pool = new Pool({ connectionString: TEST_URL });
  await migrate(drizzle(pool), { migrationsFolder: "../../infra/migrations" });

  const { seedCreditFormula, seedPriceTable } = await import("../src/seed/seed-config.js");
  await seedCreditFormula(TEST_URL);
  await seedPriceTable(TEST_URL);

  redis = new Redis(REDIS_URL);
  await redis.flushdb();

  process.env.DATABASE_URL = TEST_URL;
  process.env.MOGWAI_REDIS_URL = REDIS_URL;
  process.env.MOGWAI_KMS_BACKEND = "env_kek";
  process.env.MOGWAI_DEV_KEK =
    "5ff2e64ecb2eb27f0f28f3c31fcd7b3ea0f54b6c78dd85df42d0367bf35430c7";

  const { createApp } = await import("../src/app.js");
  app = await createApp();
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

  // 真实用户(账本 user_id 有外键):走 better-auth 注册
  const resp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "biller@example.com",
      password: "correct-horse-battery",
      name: "Biller",
    }),
  });
  expect(resp.status).toBe(200);
  cookie = resp.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const profile = (await (await api("/api/v1/account/profile")).json()) as { user_id: string };
  userId = profile.user_id;

  // 消费者与 worker 入口同一实例,直接在测试进程内运行
  const { BillingConsumer } = await import("../src/modules/billing/consumer.js");
  const consumer = app.get(BillingConsumer);
  consumerDone = consumer.run("test-consumer");
  (globalThis as Record<string, unknown>).__consumer = consumer;
}, 60_000);

afterAll(async () => {
  const consumer = (globalThis as Record<string, unknown>).__consumer as
    | { stop(): void }
    | undefined;
  consumer?.stop();
  await consumerDone;
  await app?.close();
  await redis?.quit();
  await pool?.end();
});

describe("事件 → 记账全链路", () => {
  it("usage.completed 产生平衡的双分录,金额与公式一致", async () => {
    const eventId = await publish();
    const rows = await until(async () => {
      const r = await ledgerRowsByEvent(eventId);
      return r.length === 2 ? r : undefined;
    }, "ledger entries");

    // gpt-5:usd = 1M/1M*1.25 + 0.5M/1M*10 = 6.25;cp = ceil(6.25 * 1000 * 0.05) = 313
    const [userLeg, platformLeg] = rows as [Record<string, unknown>, Record<string, unknown>];
    expect(userLeg.user_id).toBe(userId);
    expect(userLeg.account).toBe("service_fee");
    expect(userLeg.counterparty_id).toBe(PLATFORM_USER_ID);
    expect(userLeg.delta_cp).toBe("-313");
    expect(platformLeg.user_id).toBe(PLATFORM_USER_ID);
    expect(platformLeg.delta_cp).toBe("313");
    expect(userLeg.txn_id).toBe(platformLeg.txn_id);
    expect(userLeg.reason).toBe("usage_service_fee");
    expect(userLeg.formula_version).toBe("v1");

    const snapshot = userLeg.snapshot as Record<string, unknown>;
    expect(snapshot.scope).toBe("global");
    expect(snapshot.price_table_version).toBe("v1");
    expect((snapshot.variables as Record<string, number>)["price.input"]).toBe(1.25);
  });

  it("重复投递同一事件:幂等,不产生新分录", async () => {
    const eventId = await publish();
    await until(async () => {
      const r = await ledgerRowsByEvent(eventId);
      return r.length === 2 ? r : undefined;
    }, "first billing");

    await redis.xadd(
      STREAM,
      "*",
      "payload",
      JSON.stringify({
        schema_version: 1,
        event_id: eventId,
        ts: new Date().toISOString(),
        user_id: userId,
        request_id: "req-replay",
        provider: "openai",
        model: "gpt-5",
        key_source: "byok",
        input_tokens: 1_000_000,
        output_tokens: 500_000,
        cached_tokens: 0,
        latency_ms: 1,
        status: "ok",
        estimated: false,
        langfuse_trace_id: null,
      }),
    );
    // 给消费者足够时间处理重复消息,再确认没有新增分录
    await new Promise((r) => setTimeout(r, 500));
    expect((await ledgerRowsByEvent(eventId)).length).toBe(2);
  });

  it("零 token 调用不产生分录", async () => {
    const eventId = await publish({ input_tokens: 0, output_tokens: 0, status: "error" });
    await new Promise((r) => setTimeout(r, 500));
    expect((await ledgerRowsByEvent(eventId)).length).toBe(0);
  });

  it("授权投影随记账刷新,过 shared schema", async () => {
    const raw = await until(
      async () => (await redis.get(authorizationProjectionKey(userId))) ?? undefined,
      "authz projection",
    );
    const projection = authorizationProjectionSchema.parse(JSON.parse(raw));
    expect(projection.service_fee_owed_cp).toBeGreaterThan(0);
    expect(projection.blocked).toBe(false);
    expect(projection.pledge_available_cp).toBeGreaterThanOrEqual(0);
  });
});

describe("坏事件进 DLQ,消费不中断", () => {
  it("无价格的模型 → DLQ;schema 违约 → DLQ;后续正常事件照常记账", async () => {
    await publish({ model: "unknown-model-x" });
    await publish({ user_id: "" }); // schema 违约
    const goodId = await publish();

    await until(async () => {
      const r = await ledgerRowsByEvent(goodId);
      return r.length === 2 ? r : undefined;
    }, "good event billed after bad ones");

    const dlq = (await redis.lrange(DLQ_KEY, 0, -1)).map((s) => JSON.parse(s));
    expect(dlq.length).toBe(2);
    const reasons = dlq.map((d) => d.reason).sort();
    expect(reasons).toEqual(["price_missing", "schema_violation"]);
  });

  it("platform key_source(M4 未实现)→ DLQ,绝不静默按 byok 记账", async () => {
    const eventId = await publish({ key_source: "platform" });
    await until(async () => {
      const dlq = (await redis.lrange(DLQ_KEY, 0, -1)).map((s) => JSON.parse(s));
      return dlq.some((d) => d.reason === "key_source_not_implemented") ? true : undefined;
    }, "platform key_source in DLQ");
    expect((await ledgerRowsByEvent(eventId)).length).toBe(0);
  });
});

describe("billing 端点", () => {
  it("GET positions:service_fee 为负(欠费),与账本一致", async () => {
    const resp = await api("/api/v1/billing/positions");
    expect(resp.status).toBe(200);
    const dto = positionsResponseSchema.parse(await resp.json());
    expect(dto.positions.service_fee).toBeLessThan(0);
    expect(dto.positions.pledge).toBe(0);
    const { rows } = await pool.query(
      "select coalesce(sum(delta_cp), 0) as net from ledger_entries where user_id = $1 and account = 'service_fee'",
      [userId],
    );
    expect(dto.positions.service_fee).toBe(Number(rows[0].net));
  });

  it("GET ledger:keyset 分页游标可走完全部分录", async () => {
    const first = await api("/api/v1/billing/ledger?limit=2");
    const page1 = paginatedSchema(ledgerEntryViewSchema).parse(await first.json());
    expect(page1.items.length).toBe(2);
    expect(page1.next_cursor).not.toBeNull();

    const seen = new Set(page1.items.map((i) => i.id));
    let cursorParam = page1.next_cursor;
    while (cursorParam) {
      const resp = await api(`/api/v1/billing/ledger?limit=2&cursor=${cursorParam}`);
      const page = paginatedSchema(ledgerEntryViewSchema).parse(await resp.json());
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursorParam = page.next_cursor;
    }
    const { rows } = await pool.query(
      "select count(*)::int as n from ledger_entries where user_id = $1",
      [userId],
    );
    expect(seen.size).toBe(rows[0].n);
  });

  it("GET ledger?account= 过滤生效,未登录 → 401", async () => {
    const resp = await api("/api/v1/billing/ledger?account=pledge");
    const page = paginatedSchema(ledgerEntryViewSchema).parse(await resp.json());
    expect(page.items.length).toBe(0);

    const anon = await fetch(`${baseUrl}/api/v1/billing/positions`);
    expect(anon.status).toBe(401);
  });
});
