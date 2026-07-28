/**
 * 配置中心初始参数 seed(journal/TODO.md M1:1000 CP/USD、BYOK 服务费 5%)。
 * 幂等:同 (namespace, version) 已存在则跳过。运行:pnpm --filter @mogwai/core-app db:seed
 *
 * 唯一允许存放初始数据的地方(no-mocks 规则:seed 只进专用脚本,不进应用代码)。
 */
import { pathToFileURL } from "node:url";

import { creditFormulaConfigSchema } from "@mogwai/shared";
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

export async function seedCreditFormula(databaseUrl: string): Promise<boolean> {
  const db = drizzle(databaseUrl);
  const inserted = await db
    .insert(configVersions)
    .values({
      namespace: "credit_formula",
      version: "v1",
      payload: CREDIT_FORMULA_V1,
      status: "active",
      effectiveAt: new Date(),
      createdBy: "seed",
    })
    .onConflictDoNothing({
      target: [configVersions.namespace, configVersions.version],
    })
    .returning({ id: configVersions.id });
  await db.$client.end();
  return inserted.length > 0;
}

// tsx 直接执行时的入口(被测试 import 时不触发)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url =
    process.env.DATABASE_URL ?? "postgres://mogwai:mogwai_dev@localhost:5432/mogwai";
  seedCreditFormula(url).then((created) => {
    console.log(
      created
        ? "seed: credit_formula v1 (active) created"
        : "seed: credit_formula v1 already present, skipped",
    );
  });
}
