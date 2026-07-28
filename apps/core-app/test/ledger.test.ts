/**
 * 账本结构性约束的集成测试——打真实 Postgres(infra/docker-compose.yml,no-mocks 规则)。
 * 每次运行重建独立数据库 mogwai_test 并执行 infra/migrations 全量迁移,
 * 验证的就是将来生产库上生效的那套 DDL/触发器,而非模型层的想象。
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PLATFORM_USER_ID } from "@mogwai/shared";

import { users } from "../src/modules/account/schema.js";
import { configVersions } from "../src/modules/admin/schema.js";
import { ledgerEntries } from "../src/modules/billing/schema.js";
import { CREDIT_FORMULA_V1, seedCreditFormula } from "../src/seed/seed-config.js";

const ADMIN_URL =
  process.env.DATABASE_URL ?? "postgres://mogwai:mogwai_dev@localhost:5432/mogwai";
const TEST_DB = "mogwai_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB}`);

let pool: Pool;
let db: NodePgDatabase;

type LedgerLeg = typeof ledgerEntries.$inferInsert;

/** drizzle 把 pg 错误包成 DrizzleQueryError,触发器/约束消息在 cause 链里。 */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  let error: unknown;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  expect(error, `expected rejection matching ${pattern}`).toBeDefined();
  const messages: string[] = [];
  for (let e = error; e instanceof Error; e = e.cause as Error) {
    messages.push(e.message);
  }
  expect(messages.join(" | ")).toMatch(pattern);
}

beforeAll(async () => {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  pool = new Pool({ connectionString: TEST_URL });
  db = drizzle(pool);
  await migrate(db, { migrationsFolder: "../../infra/migrations" });

  await db.insert(users).values([
    { id: "u_alice", email: "alice@test.local" },
    { id: "u_bob", email: "bob@test.local" },
  ]);
}, 30_000);

afterAll(async () => {
  await pool.end();
});

function leg(overrides: Partial<LedgerLeg>): LedgerLeg {
  return {
    txnId: randomUUID(),
    eventId: randomUUID(),
    seq: 0,
    userId: "u_alice",
    account: "service_fee",
    counterpartyId: PLATFORM_USER_ID,
    deltaCp: -5n,
    reason: "usage_service_fee",
    ...overrides,
  };
}

function balancedTxn(): [LedgerLeg, LedgerLeg] {
  const txnId = randomUUID();
  const eventId = randomUUID();
  return [
    leg({ txnId, eventId, seq: 0, deltaCp: -5n }),
    leg({
      txnId,
      eventId,
      seq: 1,
      userId: PLATFORM_USER_ID,
      counterpartyId: "u_alice",
      deltaCp: 5n,
    }),
  ];
}

describe("ledger 双录一致性(tech-design §3.5)", () => {
  it("平衡的双分录 txn 提交成功", async () => {
    const legs = balancedTxn();
    await db.transaction(async (tx) => {
      await tx.insert(ledgerEntries).values(legs);
    });
    const rows = await db
      .select()
      .from(ledgerEntries)
      .where(sql`${ledgerEntries.txnId} = ${legs[0].txnId}`);
    expect(rows).toHaveLength(2);
  });

  it("不平衡的 txn 在提交时被拒绝", async () => {
    const [a, b] = balancedTxn();
    b.deltaCp = 6n; // -5 + 6 ≠ 0
    await expectDbError(
      db.transaction(async (tx) => {
        await tx.insert(ledgerEntries).values([a, b]);
      }),
      /unbalanced/,
    );
  });

  it("单分录 txn 被拒绝", async () => {
    // delta≠0 CHECK 下单分录必不平衡,unbalanced 先命中;legs>=2 是纵深防御
    await expectDbError(
      db.transaction(async (tx) => {
        await tx.insert(ledgerEntries).values([leg({})]);
      }),
      /unbalanced|leg/,
    );
  });

  it("重复消费同一事件被 (event_id, seq) 幂等键整体拒绝", async () => {
    const legs = balancedTxn();
    await db.transaction(async (tx) => {
      await tx.insert(ledgerEntries).values(legs);
    });
    // 同一事件再次入账(哪怕 txn_id 不同)必须整体失败
    const replayTxn = randomUUID();
    const replay: [LedgerLeg, LedgerLeg] = [
      { ...legs[0], txnId: replayTxn },
      { ...legs[1], txnId: replayTxn },
    ];
    await expectDbError(
      db.transaction(async (tx) => {
        await tx.insert(ledgerEntries).values(replay);
      }),
      /duplicate key.*ledger_event_seq_uq/s,
    );
  });

  it("UPDATE 被拒绝(只增不改)", async () => {
    await expectDbError(
      db.update(ledgerEntries).set({ reason: "tampered" }),
      /append-only/,
    );
  });

  it("DELETE 被拒绝(只增不改)", async () => {
    await expectDbError(db.delete(ledgerEntries), /append-only/);
  });

  it("delta_cp = 0 的分录被 CHECK 拒绝", async () => {
    const [a, b] = balancedTxn();
    a.deltaCp = 0n;
    b.deltaCp = 0n;
    await expectDbError(
      db.transaction(async (tx) => {
        await tx.insert(ledgerEntries).values([a, b]);
      }),
      /ledger_delta_nonzero/,
    );
  });
});

describe("users / 哨兵账户", () => {
  it("PLATFORM 哨兵行由迁移写入", async () => {
    const rows = await db
      .select()
      .from(users)
      .where(sql`${users.id} = ${PLATFORM_USER_ID}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tier).toBe("internal");
  });
});

describe("config_versions(tech-design §3.4)", () => {
  it("seed 幂等:首跑写入 active v1,重跑跳过", async () => {
    expect(await seedCreditFormula(TEST_URL)).toBe(true);
    expect(await seedCreditFormula(TEST_URL)).toBe(false);
    const rows = await db
      .select()
      .from(configVersions)
      .where(sql`${configVersions.namespace} = 'credit_formula'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]?.payload).toEqual(CREDIT_FORMULA_V1);
  });

  it("同 namespace 第二个 active 被部分唯一索引拒绝", async () => {
    await expectDbError(
      db.insert(configVersions).values({
        namespace: "credit_formula",
        version: "v2",
        payload: CREDIT_FORMULA_V1,
        status: "active",
        createdBy: "test",
      }),
      /config_single_active_uq/,
    );
  });

  it("draft 版本可与 active 并存", async () => {
    await db.insert(configVersions).values({
      namespace: "credit_formula",
      version: "v3-draft",
      payload: CREDIT_FORMULA_V1,
      status: "draft",
      createdBy: "test",
    });
    const rows = await db
      .select()
      .from(configVersions)
      .where(sql`${configVersions.namespace} = 'credit_formula'`);
    expect(rows).toHaveLength(2);
  });
});
