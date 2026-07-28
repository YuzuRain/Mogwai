import { z } from "zod";

import { CONFIG_NAMESPACES, creditFormulaConfigSchema } from "../config/credit-formula.js";

/** admin 模块管理面 DTO(architecture B4.1;版本化语义见 tech-design §3.4)。 */

export const configNamespaceSchema = z.enum(CONFIG_NAMESPACES);

export const CONFIG_STATUSES = ["draft", "gray", "active", "retired"] as const;
export const configStatusSchema = z.enum(CONFIG_STATUSES);

/**
 * 各 namespace 的 payload schema 注册表。
 * 尚未定义 schema 的 namespace 不可写入(422 config/payload_schema_missing,
 * 响亮失败)——新 namespace 落地时必须先在 shared 补 schema,再开放写入。
 */
export const configPayloadSchemas: Partial<
  Record<z.infer<typeof configNamespaceSchema>, z.ZodType>
> = {
  credit_formula: creditFormulaConfigSchema,
};

export const configVersionViewSchema = z.object({
  id: z.string().min(1),
  namespace: configNamespaceSchema,
  version: z.string().min(1),
  payload: z.unknown(),
  status: configStatusSchema,
  gray_ratio: z.number().min(0).max(1).nullable(),
  effective_at: z.iso.datetime({ offset: true }).nullable(),
  created_by: z.string().min(1),
  created_at: z.iso.datetime({ offset: true }),
});
export type ConfigVersionView = z.infer<typeof configVersionViewSchema>;

/** 新建一律为 draft;activate 是独立端点(单事务完成 draft→active、原 active→retired)。 */
export const createConfigRequestSchema = z.object({
  namespace: configNamespaceSchema,
  version: z.string().min(1),
  payload: z.unknown(),
});
