import { z } from "zod";

/**
 * 折算公式配置 payload(tech-design §3.4,REVIEW Block 14)——
 * 存于 config_versions(namespace: `credit_formula`),一个版本 = 完整规则集。
 * admin 写入与 billing 求值(packages/formula-engine)共用本 schema。
 */
export const creditFormulaScopeSchema = z.union([
  z.literal("global"),
  z.string().regex(/^provider:[^/\s]+$/, "provider scope 形如 provider:openai"),
  z.string().regex(/^model:[^/\s]+\/.+$/, "model scope 形如 model:openai/gpt-5"),
]);

export const creditFormulaRuleSchema = z.object({
  scope: creditFormulaScopeSchema,
  /** 公式 DSL 文本(tech-design §3.3);求值沙箱负责解析,这里只保证非空。 */
  expression: z.string().min(1),
  /** 规则自带的默认变量(fx_rate / margin / tier_discount…);price.* 由价格表运行时注入。 */
  variables: z.record(z.string(), z.number()),
});

export const creditFormulaConfigSchema = z.object({
  /** 匹配优先级 model > provider > global,命中即停;必须含 global 兜底。 */
  rules: z
    .array(creditFormulaRuleSchema)
    .min(1)
    .refine((rules) => rules.some((r) => r.scope === "global"), {
      message: "rules 必须包含 scope=global 的兜底规则",
    }),
});

export type CreditFormulaRule = z.infer<typeof creditFormulaRuleSchema>;
export type CreditFormulaConfig = z.infer<typeof creditFormulaConfigSchema>;

/** config_versions.namespace 的合法值(architecture B3);新增 namespace 时扩展此处。 */
export const CONFIG_NAMESPACES = [
  "credit_formula",
  "ev_weights",
  "gacha_rates",
  "battle_params",
] as const;
export type ConfigNamespace = (typeof CONFIG_NAMESPACES)[number];
