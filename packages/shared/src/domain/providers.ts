import { z } from "zod";

/**
 * 首发 provider 名单(tech-design §1.1,REVIEW Block 2 裁定)——对外模型名前缀
 * 与托管 Key 的 provider 字段共用此单一权威。qwen→dashscope、volcengine 等
 * 适配层映射是 gateway 内部实现细节(gateway/README.md),不出现在契约里。
 */
export const PROVIDERS = ["openai", "anthropic", "deepseek", "qwen", "volcengine"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof providerSchema>;

/** 托管 Key 状态机(tech-design §2.1);DB CHECK 与 API DTO 共用。 */
export const KEY_STATUSES = [
  "pending_verify",
  "active",
  "throttled",
  "invalid",
  "revoked",
] as const;
export const keyStatusSchema = z.enum(KEY_STATUSES);
export type KeyStatus = z.infer<typeof keyStatusSchema>;
