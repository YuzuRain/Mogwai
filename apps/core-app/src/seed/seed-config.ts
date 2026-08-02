/**
 * 配置中心初始参数 seed(journal/TODO.md M1:1000 CP/USD、BYOK 服务费 5%)。
 * 幂等:同 (namespace, version) 已存在则跳过。运行:pnpm --filter @mogwai/core-app db:seed
 *
 * 唯一允许存放初始数据的地方(no-mocks 规则:seed 只进专用脚本,不进应用代码)。
 */
import { pathToFileURL } from "node:url";

import { creditFormulaConfigSchema, priceTableConfigSchema } from "@mogwai/shared";
import { drizzle } from "drizzle-orm/node-postgres";

import { configVersions } from "../modules/admin/schema.js";

// tech-design §3.3 默认公式 + §3.4 payload 结构;REVIEW Block 3 裁定的初始值。
export const CREDIT_FORMULA_V1 = creditFormulaConfigSchema.parse({
  rules: [
    {
      scope: "global",
      expression:
        "ceil((input_tokens / 1e6 * price.input + output_tokens / 1e6 * price.output + cached_tokens / 1e6 * price.cached) * fx_rate * margin * tier_discount)",
      variables: {
        fx_rate: 1000, // 1 USD = 1000 CP
        margin: 0.05, // 首发纯 BYOK:5% 服务费(CP 直购 margin 1.15 随 M4)
        tier_discount: 1,
      },
    },
  ],
});

/**
 * Layer 1 价格表 v1(tech-design §3.2,namespace price_table)。
 * 单价为 USD / 1M tokens,按 2026-07 各家公开刊例价录入;
 * 官方调价 = 经 admin 发新版本,这里只是首个版本的初始值。
 */
export const PRICE_TABLE_V1 = priceTableConfigSchema.parse({
  prices: {
    "openai/gpt-5": { input: 1.25, output: 10, cached: 0.125 },
    "openai/gpt-5-mini": { input: 0.25, output: 2, cached: 0.025 },
    "anthropic/claude-sonnet-4-20250514": { input: 3, output: 15, cached: 0.3 },
    "anthropic/claude-3-5-haiku-20241022": { input: 0.8, output: 4, cached: 0.08 },
    "deepseek/deepseek-chat": { input: 0.27, output: 1.1, cached: 0.07 },
    "qwen/qwen-max": { input: 1.6, output: 6.4, cached: 0.16 },
    "volcengine/doubao-seed-1-6-250615": { input: 0.11, output: 1.1, cached: 0.022 },
  },
});

async function seedNamespace(
  db: ReturnType<typeof drizzle>,
  namespace: string,
  payload: unknown,
): Promise<boolean> {
  const inserted = await db
    .insert(configVersions)
    .values({
      namespace,
      version: "v1",
      payload,
      status: "active",
      effectiveAt: new Date(),
      createdBy: "seed",
    })
    .onConflictDoNothing({
      target: [configVersions.namespace, configVersions.version],
    })
    .returning({ id: configVersions.id });
  return inserted.length > 0;
}

export async function seedCreditFormula(databaseUrl: string): Promise<boolean> {
  const db = drizzle(databaseUrl);
  const created = await seedNamespace(db, "credit_formula", CREDIT_FORMULA_V1);
  await db.$client.end();
  return created;
}

export async function seedPriceTable(databaseUrl: string): Promise<boolean> {
  const db = drizzle(databaseUrl);
  const created = await seedNamespace(db, "price_table", PRICE_TABLE_V1);
  await db.$client.end();
  return created;
}

// tsx 直接执行时的入口(被测试 import 时不触发)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url =
    process.env.DATABASE_URL ?? "postgres://mogwai:mogwai_dev@localhost:5432/mogwai";
  for (const [namespace, seed] of [
    ["credit_formula", seedCreditFormula],
    ["price_table", seedPriceTable],
  ] as const) {
    const created = await seed(url);
    console.log(
      created
        ? `seed: ${namespace} v1 (active) created`
        : `seed: ${namespace} v1 already present, skipped`,
    );
  }
}
