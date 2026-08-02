/**
 * account 模块集成测试——真实 Postgres + Redis + 完整 Nest 应用(no-mocks 规则)。
 * 唯一的测试替身是 FakeProviderServer(付费外部 API,规则允许的例外):
 * 只区分「密钥有效(200)/ 无效(401)」两种探测语义。
 *
 * 覆盖:better-auth 会话链路、错误信封、token 签发/吊销与 token 投影、
 * privacy_mode 联动、Key 托管全状态机与 Key 路由投影(含信封解密还原明文)。
 */
import { createHash, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Redis } from "ioredis";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  apiErrorEnvelopeSchema,
  createTokenResponseSchema,
  keyRoutingProjectionKey,
  keyRoutingProjectionSchema,
  paginatedSchema,
  platformTokenSchema,
  profileSchema,
  providerKeySchema,
  tokenProjectionKey,
  tokenProjectionSchema,
} from "@mogwai/shared";

const ADMIN_URL =
  process.env.DATABASE_URL ?? "postgres://mogwai:mogwai_dev@localhost:5432/mogwai";
const TEST_DB = "mogwai_test_account";
const TEST_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB}`);
const REDIS_URL = "redis://localhost:6379/3";
const GOOD_KEY = "sk-live-good-key-12345678";

let app: import("@nestjs/common").INestApplication;
let baseUrl: string;
let redis: Redis;
let pool: Pool;
let fakeProvider: Server;
let cookie: string;
let userId: string;

/** 具名测试替身:模拟 provider 探测端点,只认 GOOD_KEY。 */
function startFakeProviderServer(): Promise<Server> {
  const server = createServer((req, res) => {
    const auth = req.headers.authorization ?? req.headers["x-api-key"] ?? "";
    const key = typeof auth === "string" ? auth.replace(/^Bearer /, "") : "";
    if (req.url?.startsWith("/models") && key === GOOD_KEY) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [] }));
    } else {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid key" }));
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
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

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
  });
}

beforeAll(async () => {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  pool = new Pool({ connectionString: TEST_URL });
  await migrate(drizzle(pool), { migrationsFolder: "../../infra/migrations" });

  redis = new Redis(REDIS_URL);
  await redis.flushdb();

  fakeProvider = await startFakeProviderServer();
  const fakeBase = `http://127.0.0.1:${(fakeProvider.address() as AddressInfo).port}`;

  process.env.DATABASE_URL = TEST_URL;
  process.env.MOGWAI_REDIS_URL = REDIS_URL;
  process.env.MOGWAI_KMS_BACKEND = "env_kek";
  process.env.MOGWAI_DEV_KEK =
    "5ff2e64ecb2eb27f0f28f3c31fcd7b3ea0f54b6c78dd85df42d0367bf35430c7";
  for (const p of ["OPENAI", "ANTHROPIC", "DEEPSEEK", "QWEN", "VOLCENGINE"]) {
    process.env[`MOGWAI_PROBE_BASE_URL_${p}`] = fakeBase;
  }

  const { createApp } = await import("../src/app.js");
  app = await createApp();
  await app.listen(0);
  const address = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 60_000);

afterAll(async () => {
  await app?.close();
  fakeProvider?.close();
  await redis?.quit();
  await pool?.end();
});

describe("鉴权与错误信封", () => {
  it("无会话 → 401,错误信封过 shared schema", async () => {
    const resp = await api("/api/v1/account/profile");
    expect(resp.status).toBe(401);
    const body = apiErrorEnvelopeSchema.parse(await resp.json());
    expect(body.error.code).toBe("auth/unauthorized");
  });

  it("better-auth 注册 → session cookie 可用", async () => {
    const resp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "trainer@example.com",
        password: "correct-horse-battery",
        name: "Trainer",
      }),
    });
    expect(resp.status).toBe(200);
    const setCookie = resp.headers.getSetCookie();
    expect(setCookie.length).toBeGreaterThan(0);
    cookie = setCookie.map((c) => c.split(";")[0]).join("; ");

    const profile = await api("/api/v1/account/profile");
    expect(profile.status).toBe(200);
    const dto = profileSchema.parse(await profile.json());
    expect(dto.email).toBe("trainer@example.com");
    expect(dto.privacy_mode).toBe(false);
    userId = dto.user_id;
  });
});

describe("平台 token 与 token 投影", () => {
  let tokenId: string;
  let tokenSha: string;

  it("签发:明文只出现一次,投影同步写入且过 shared schema", async () => {
    const resp = await api("/api/v1/account/tokens", { method: "POST" });
    expect(resp.status).toBe(201);
    const dto = createTokenResponseSchema.parse(await resp.json());
    expect(dto.token.startsWith("mgw_")).toBe(true);
    expect(dto.token_prefix).toBe(dto.token.slice(0, 12));
    tokenId = dto.token_id;
    tokenSha = createHash("sha256").update(dto.token).digest("hex");

    const projection = tokenProjectionSchema.parse(
      await redis.hgetall(tokenProjectionKey(tokenSha)),
    );
    expect(projection.user_id).toBe(userId);
    expect(projection.privacy_mode).toBe("0");
    expect(projection.blocked).toBe("0");

    const list = await api("/api/v1/account/tokens");
    const items = paginatedSchema(platformTokenSchema).parse(await list.json()).items;
    expect(items.map((t) => t.token_id)).toContain(tokenId);
  });

  it("privacy_mode 变更同步全部 token 投影", async () => {
    const resp = await api("/api/v1/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ privacy_mode: true }),
    });
    expect(profileSchema.parse(await resp.json()).privacy_mode).toBe(true);
    expect(await redis.hget(tokenProjectionKey(tokenSha), "privacy_mode")).toBe("1");
    // blocked 归 billing 所有,不被 privacy 同步触碰
    expect(await redis.hget(tokenProjectionKey(tokenSha), "blocked")).toBe("0");
  });

  it("吊销:投影删除,列表不再出现", async () => {
    const resp = await api(`/api/v1/account/tokens/${tokenId}`, { method: "DELETE" });
    expect(resp.status).toBe(204);
    expect(await redis.exists(tokenProjectionKey(tokenSha))).toBe(0);

    const list = await api("/api/v1/account/tokens");
    const items = paginatedSchema(platformTokenSchema).parse(await list.json()).items;
    expect(items.map((t) => t.token_id)).not.toContain(tokenId);
  });

  it("吊销不存在的 token → 404", async () => {
    const resp = await api(`/api/v1/account/tokens/tok_${randomUUID()}`, { method: "DELETE" });
    expect(resp.status).toBe(404);
    expect(apiErrorEnvelopeSchema.parse(await resp.json()).error.code).toBe("resource/not_found");
  });
});

describe("Key 托管与路由投影", () => {
  let keyId: string;

  async function keyStatus(id: string): Promise<string | undefined> {
    const resp = await api("/api/v1/account/keys");
    const items = paginatedSchema(providerKeySchema).parse(await resp.json()).items;
    return items.find((k) => k.key_id === id)?.status;
  }

  it("录入有效 Key:pending_verify → active,投影含可解密的信封密文", async () => {
    const resp = await api("/api/v1/account/keys", {
      method: "POST",
      body: JSON.stringify({ provider: "openai", key: GOOD_KEY, model_whitelist: ["gpt-5"] }),
    });
    expect(resp.status).toBe(201);
    const dto = providerKeySchema.parse(await resp.json());
    keyId = dto.key_id;
    // 异步探测与响应读取存在良性竞态:本机 fake provider 可能在响应前就完成探测
    expect(["pending_verify", "active"]).toContain(dto.status);

    await until(
      async () => ((await keyStatus(keyId)) === "active" ? true : undefined),
      "key to become active",
    );

    const raw = await redis.get(keyRoutingProjectionKey(userId));
    expect(raw).not.toBeNull();
    const entries = keyRoutingProjectionSchema.parse(JSON.parse(raw!));
    const entry = entries.find((e) => e.key_id === keyId)!;
    expect(entry.provider).toBe("openai");
    expect(entry.model_whitelist).toEqual(["gpt-5"]);

    // 投影里的密文必须能按线格式契约还原出录入的明文(gateway 解密同一格式)
    const { envelopeDecrypt } = await import("../src/modules/account/envelope.js");
    expect(
      envelopeDecrypt({
        nonce: entry.nonce,
        ciphertext: entry.ciphertext,
        encryptedDek: entry.encrypted_dek,
      }),
    ).toBe(GOOD_KEY);
  });

  it("录入无效 Key:探测 401 → invalid,不进投影", async () => {
    const resp = await api("/api/v1/account/keys", {
      method: "POST",
      body: JSON.stringify({ provider: "anthropic", key: "sk-bad-key-12345678" }),
    });
    const badId = providerKeySchema.parse(await resp.json()).key_id;

    await until(
      async () => ((await keyStatus(badId)) === "invalid" ? true : undefined),
      "key to become invalid",
    );

    const entries = keyRoutingProjectionSchema.parse(
      JSON.parse((await redis.get(keyRoutingProjectionKey(userId)))!),
    );
    expect(entries.map((e) => e.key_id)).not.toContain(badId);
  });

  it("白名单修改同步投影", async () => {
    const resp = await api(`/api/v1/account/keys/${keyId}`, {
      method: "PATCH",
      body: JSON.stringify({ model_whitelist: ["gpt-5", "gpt-5-mini"] }),
    });
    expect(providerKeySchema.parse(await resp.json()).model_whitelist).toEqual([
      "gpt-5",
      "gpt-5-mini",
    ]);
    const entries = keyRoutingProjectionSchema.parse(
      JSON.parse((await redis.get(keyRoutingProjectionKey(userId)))!),
    );
    expect(entries.find((e) => e.key_id === keyId)?.model_whitelist).toEqual([
      "gpt-5",
      "gpt-5-mini",
    ]);
  });

  it("吊销 Key:先剔投影后落库,列表不再出现", async () => {
    const resp = await api(`/api/v1/account/keys/${keyId}`, { method: "DELETE" });
    expect(resp.status).toBe(204);
    // 该用户唯一 active Key 被吊销 → 投影整键删除
    expect(await redis.exists(keyRoutingProjectionKey(userId))).toBe(0);
    expect(await keyStatus(keyId)).toBeUndefined();
  });

  it("非法 provider → 422,信封带 zod issues", async () => {
    const resp = await api("/api/v1/account/keys", {
      method: "POST",
      body: JSON.stringify({ provider: "gemini", key: "sk-whatever-12345678" }),
    });
    expect(resp.status).toBe(422);
    const body = apiErrorEnvelopeSchema.parse(await resp.json());
    expect(body.error.code).toBe("validation/invalid_request");
    expect(body.error.details).toBeDefined();
  });
});
