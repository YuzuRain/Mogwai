import { describe, expect, it } from "vitest";
import {
  authorizationProjectionKey,
  authorizationProjectionSchema,
  keyRoutingProjectionKey,
  keyRoutingProjectionSchema,
  tokenProjectionKey,
  tokenProjectionSchema,
} from "../src/index.js";

describe("token projection", () => {
  it("accepts redis-hash string values", () => {
    const parsed = tokenProjectionSchema.parse({
      user_id: "u_1",
      privacy_mode: "0",
      blocked: "0",
      rpm: "60",
    });
    expect(parsed.privacy_mode).toBe("0");
  });

  it("rejects non-string-boolean flags", () => {
    expect(
      tokenProjectionSchema.safeParse({ user_id: "u_1", privacy_mode: "yes", blocked: "0" })
        .success,
    ).toBe(false);
  });

  it("builds the redis key from the token hash", () => {
    expect(tokenProjectionKey("abc123")).toBe("proj:token:abc123");
  });
});

describe("key routing projection", () => {
  it("accepts envelope-encrypted entries", () => {
    const parsed = keyRoutingProjectionSchema.parse([
      {
        key_id: "pk_1",
        provider: "anthropic",
        nonce: "AAAAAAAAAAAAAAAA",
        ciphertext: "AAAA",
        encrypted_dek: "AAAA",
        model_whitelist: ["claude-3-haiku"],
      },
    ]);
    expect(parsed[0]?.provider).toBe("anthropic");
    expect(keyRoutingProjectionKey("u_1")).toBe("proj:keys:u_1");
  });

  it("rejects non-base64 ciphertext", () => {
    expect(
      keyRoutingProjectionSchema.safeParse([
        {
          key_id: "pk_1",
          provider: "openai",
          nonce: "not base64!!",
          ciphertext: "AAAA",
          encrypted_dek: "AAAA",
          model_whitelist: [],
        },
      ]).success,
    ).toBe(false);
  });
});

describe("authorization projection", () => {
  it("accepts debts and credits with fifo timestamps", () => {
    const parsed = authorizationProjectionSchema.parse({
      service_fee_owed_cp: 120,
      pledge_available_cp: 5000,
      debts: [
        { creditor_user_id: "u_2", amount_cp: 300, incurred_at: "2026-07-25T10:00:00+08:00" },
      ],
      credits: [{ debtor_user_id: "u_3", amount_cp: 150, incurred_at: "2026-07-25T09:00:00Z" }],
      blocked: false,
    });
    expect(parsed.debts[0]?.amount_cp).toBe(300);
    expect(authorizationProjectionKey("u_1")).toBe("proj:authz:u_1");
  });

  it("rejects negative owed fees", () => {
    expect(
      authorizationProjectionSchema.safeParse({
        service_fee_owed_cp: -1,
        pledge_available_cp: 0,
        debts: [],
        credits: [],
        blocked: false,
      }).success,
    ).toBe(false);
  });
});
