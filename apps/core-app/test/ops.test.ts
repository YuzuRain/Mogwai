/**
 * 运维任务集成测试——真实 Postgres + Redis + 完整 Nest 应用(no-mocks 规则,
 * provider 探测打具名测试替身,付费外部 API 的唯一允许例外)。
 *
 * 覆盖:Key 健康巡检全状态流转(active↔throttled、invalid 剔除路由投影)、
 * 每日对账(漏账幂等补记、坏事件进 DLQ、二次对账无重复动作)、DLQ 重放工具。
 */
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Redis } from "ioredis";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { keyRoutingProjectionKey, streamKey } from "@mogwai/shared";

const ADMIN_URL =
  process.env.DATABASE_URL ?? "postgres://mogwai:mogwai_dev@localhost:5432/mogwai";
const TEST_DB = "mogwai_test_ops";
const TEST_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB}`);
const REDIS_URL = "redis://localhost:6379/5";
const STREAM = streamKey("usage.completed");
const DLQ_KEY = "billing:dlq:usage.completed";

const KEY_OK = "sk-ops-good-key-123456";
const KEY_BAD = "sk-ops-bad-key-1234567";
const KEY_429 = "sk-ops-throttled-key-1";

let app: import("@nestjs/common").INestApplication;
let fakeProvider: Server;
let redis: Redis;
let pool: Pool;
let userId: string;

/** 具名测试替身:按 Key 返回 200 / 429 / 401,模拟 provider 探测语义。 */
function startFakeProviderServer(): Promise<Server> {
  const server = createServer((req, res) => {
    const auth = req.headers.authorization ?? "";
    const key = typeof auth === "string" ? auth.replace(/^Bearer /, "") : "";
    if (key === KEY_OK) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    } else if (key === KEY_429) {
      res.writeHead(429);
      res.end();
    } else {
      res.writeHead(401);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

async function insertKey(id: string, plaintext: string, status: string): Promise<void> {
  const { envelopeEncrypt } = await import("../src/modules/account/envelope.js");
  const sealed = envelopeEncrypt(plaintext);
  await pool.query(
    `insert into provider_keys (id, user_id, provider, encrypted_dek, ciphertext, nonce, model_whitelist, status)
     values ($1, $2, 'openai', $3, $4, $5, '[]'::jsonb, $6)`,
    [id, userId, sealed.encryptedDek, sealed.ciphertext, sealed.nonce, status],
  );
}

async function keyStatus(id: string): Promise<string> {
  const { rows } = await pool.query("select status from provider_keys where id = $1", [id]);
  return rows[0]?.status as string;
}

function usageEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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

  fakeProvider = await startFakeProviderServer();
  const fakeBase = `http://127.0.0.1:${(fakeProvider.address() as AddressInfo).port}`;

  process.env.DATABASE_URL = TEST_URL;
  process.env.MOGWAI_REDIS_URL = REDIS_URL;
  process.env.MOGWAI_KMS_BACKEND = "env_kek";
  process.env.MOGWAI_DEV_KEK =
    "5ff2e64ecb2eb27f0f28f3c31fcd7b3ea0f54b6c78dd85df42d0367bf35430c7";
  process.env.MOGWAI_PROBE_BASE_URL_OPENAI = fakeBase;

  const { createApp } = await import("../src/app.js");
  app = await createApp();
  await app.listen(0);
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

  // 真实用户(provider_keys / ledger_entries 外键)
  const resp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "ops@example.com",
      password: "correct-horse-battery",
      name: "Ops",
    }),
  });
  expect(resp.status).toBe(200);
  const cookie = resp.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const profile = (await (
    await fetch(`${baseUrl}/api/v1/account/profile`, { headers: { cookie } })
  ).json()) as { user_id: string };
  userId = profile.user_id;
}, 60_000);

afterAll(async () => {
  await app?.close();
  fakeProvider?.close();
  await redis?.quit();
  await pool?.end();
});

describe("Key 健康巡检", () => {
  it("全状态流转:失效剔除、限流暂停、恢复捞回,路由投影同步", async () => {
    await insertKey("key_ok", KEY_OK, "active"); // 保持 active
    await insertKey("key_gone_bad", KEY_BAD, "active"); // → invalid
    await insertKey("key_hits_limit", KEY_429, "active"); // → throttled
    await insertKey("key_recovers", KEY_OK, "throttled"); // → active

    const { ProjectionsService } = await import("../src/modules/account/projections.service.js");
    const projections = app.get(ProjectionsService);
    await projections.rebuildKeyRouting(userId);

    const { AccountService } = await import("../src/modules/account/account.service.js");
    const summary = await app.get(AccountService).patrolKeys();

    expect(summary).toEqual({ probed: 4, activated: 1, throttled: 1, invalidated: 1 });
    expect(await keyStatus("key_ok")).toBe("active");
    expect(await keyStatus("key_gone_bad")).toBe("invalid");
    expect(await keyStatus("key_hits_limit")).toBe("throttled");
    expect(await keyStatus("key_recovers")).toBe("active");

    // 路由投影只含 active:key_ok + key_recovers
    const raw = await redis.get(keyRoutingProjectionKey(userId));
    const routed = (JSON.parse(raw!) as Array<{ key_id: string }>).map((e) => e.key_id).sort();
    expect(routed).toEqual(["key_ok", "key_recovers"]);
  });
});

describe("每日对账(stream ↔ ledger)", () => {
  it("漏账事件被幂等补记,坏事件进 DLQ,二次对账无重复动作", async () => {
    // 消费者不在跑:三个事件都会成为「漏账」候选
    const missedId = randomUUID();
    await redis.xadd(STREAM, "*", "payload", JSON.stringify(usageEvent({ event_id: missedId })));
    await redis.xadd(
      STREAM,
      "*",
      "payload",
      JSON.stringify(usageEvent({ model: "model-without-price" })),
    );
    const zeroCostId = randomUUID();
    await redis.xadd(
      STREAM,
      "*",
      "payload",
      JSON.stringify(usageEvent({ event_id: zeroCostId, input_tokens: 0, output_tokens: 0 })),
    );

    const { BillingReconciler } = await import("../src/modules/billing/reconciler.js");
    const reconciler = app.get(BillingReconciler);
    const report = await reconciler.reconcile(3600_000, 0);

    expect(report.scanned).toBe(3);
    expect(report.healed_billed).toBe(1);
    expect(report.healed_dlq).toBe(1);
    expect(report.zero_cost).toBe(1);
    expect(report.dlq_depth).toBe(1);

    // 补记的分录真实落账且平衡
    const { rows } = await pool.query(
      "select delta_cp from ledger_entries where event_id = $1 order by seq",
      [missedId],
    );
    expect(rows.map((r: { delta_cp: string }) => r.delta_cp)).toEqual(["-313", "313"]);

    // 二次对账:已记账/已 DLQ 各归各位,零成本重判,无新动作
    const second = await reconciler.reconcile(3600_000, 0);
    expect(second.healed_billed).toBe(0);
    expect(second.healed_dlq).toBe(0);
    expect(second.in_ledger).toBe(1);
    expect(second.in_dlq).toBe(1);
    expect(second.zero_cost).toBe(1);
  });
});

describe("DLQ 重放工具", () => {
  it("replay --all:事件回流、DLQ 清空;根因未修则再次对账仍进 DLQ", async () => {
    const { replayDlq } = await import("../scripts/dlq.js");
    const lenBefore = await redis.xlen(STREAM);

    const replayed = await replayDlq(redis, "--all");
    expect(replayed).toBe(1);
    expect(await redis.llen(DLQ_KEY)).toBe(0);
    expect(await redis.xlen(STREAM)).toBe(lenBefore + 1);

    // 价格仍缺失 → 对账把「原始消息 + 重放副本」都再次送进 DLQ:
    // replay 移除 DLQ 条目后原始流消息失去已处理标记,根因修复前重放只会回到 DLQ
    // (消费者幂等,重复无害但有日志噪音;修复根因后重放成账,event_id 进账本即全覆盖)
    const { BillingReconciler } = await import("../src/modules/billing/reconciler.js");
    const report = await app.get(BillingReconciler).reconcile(3600_000, 0);
    expect(report.healed_dlq).toBe(2);
    expect(await redis.llen(DLQ_KEY)).toBe(2);
  });
});
