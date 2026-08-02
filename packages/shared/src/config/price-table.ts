import { z } from "zod";

/**
 * Layer 1 价格表(tech-design §3.2)——provider/model 原始单价,USD / 1M tokens。
 * 存于 config_versions(namespace: `price_table`),与折算公式同一套版本化机制:
 * 官方调价 = 发新版本,ledger snapshot 记录当笔生效的 price.*,审计重算无歧义。
 * 键:`provider/model`(与网关对外模型名 tech-design §2.2 一致)。
 */
export const modelPriceSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cached: z.number().nonnegative(),
});

export const priceTableConfigSchema = z.object({
  prices: z.record(
    z.string().regex(/^[^/\s]+\/.+$/, "价格键形如 provider/model"),
    modelPriceSchema,
  ),
});

export type ModelPrice = z.infer<typeof modelPriceSchema>;
export type PriceTableConfig = z.infer<typeof priceTableConfigSchema>;
