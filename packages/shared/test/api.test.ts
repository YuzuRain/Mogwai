import { describe, expect, it } from "vitest";

import {
  API_ERROR_CODES,
  apiErrorEnvelopeSchema,
  configPayloadSchemas,
  createConfigRequestSchema,
  createKeyRequestSchema,
  creditFormulaConfigSchema,
  ledgerEntryViewSchema,
  paginationQuerySchema,
  positionsResponseSchema,
  profileSchema,
} from "../src/index.js";

describe("api/error-codes", () => {
  it("错误码 → HTTP 状态映射合法", () => {
    for (const [code, status] of Object.entries(API_ERROR_CODES)) {
      expect(code).toMatch(/^[a-z]+\/[a-z_]+$/);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThanOrEqual(599);
    }
  });

  it("错误信封只接受注册过的 code", () => {
    expect(
      apiErrorEnvelopeSchema.safeParse({
        error: { code: "auth/unauthorized", message: "no session" },
      }).success,
    ).toBe(true);
    expect(
      apiErrorEnvelopeSchema.safeParse({
        error: { code: "made/up_code", message: "x" },
      }).success,
    ).toBe(false);
  });
});

describe("api/account", () => {
  it("profile 样例通过", () => {
    expect(
      profileSchema.safeParse({
        user_id: "u_1",
        email: "dev@example.com",
        tier: "standard",
        privacy_mode: false,
        pledge_limit_cp: 0,
        created_at: "2026-07-28T08:00:00+08:00",
      }).success,
    ).toBe(true);
  });

  it("录 Key 请求:非法 provider 拒绝,whitelist 默认空数组", () => {
    expect(
      createKeyRequestSchema.safeParse({ provider: "gemini", key: "sk-12345678" }).success,
    ).toBe(false);
    const parsed = createKeyRequestSchema.parse({
      provider: "volcengine",
      key: "sk-12345678",
    });
    expect(parsed.model_whitelist).toEqual([]);
  });
});

describe("api/billing", () => {
  it("positions / ledger 视图样例通过", () => {
    expect(
      positionsResponseSchema.safeParse({
        positions: { pledge: 0, debt: -500, service_fee: -12 },
        pledge_available_cp: 1000,
      }).success,
    ).toBe(true);
    expect(
      ledgerEntryViewSchema.safeParse({
        id: "1",
        txn_id: "018f6f96-8b86-4011-b42d-00c04fc964ff",
        event_id: "018f6f96-8b86-4011-b42d-00c04fc964fe",
        seq: 0,
        account: "service_fee",
        counterparty_id: "PLATFORM",
        delta_cp: -5,
        reason: "usage_service_fee",
        ref_type: "usage",
        ref_id: "req_1",
        formula_version: "v1",
        snapshot: { fx_rate: 1000 },
        created_at: "2026-07-28T00:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("分页 limit 有上限", () => {
    expect(paginationQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
    expect(paginationQuerySchema.parse({}).limit).toBe(50);
  });
});

describe("api/admin", () => {
  it("credit_formula 的 payload schema 已注册,且与创建请求组合可校验", () => {
    const payloadSchema = configPayloadSchemas.credit_formula;
    expect(payloadSchema).toBe(creditFormulaConfigSchema);
    const req = createConfigRequestSchema.parse({
      namespace: "credit_formula",
      version: "v2",
      payload: { rules: [{ scope: "global", expression: "1", variables: {} }] },
    });
    expect(payloadSchema!.safeParse(req.payload).success).toBe(true);
  });

  it("未注册 payload schema 的 namespace 在注册表中缺席(服务端据此拒写)", () => {
    expect(configPayloadSchemas.ev_weights).toBeUndefined();
  });
});
