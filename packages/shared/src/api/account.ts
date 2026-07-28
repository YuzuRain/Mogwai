import { z } from "zod";

import { keyStatusSchema, providerSchema } from "../domain/providers.js";

/**
 * account 模块管理面 DTO(architecture B4.1)。
 * 红线:provider key 明文只出现在录入请求体,平台 token 明文只出现在签发响应体;
 * 任何 GET DTO 都不含密文/明文/哈希原文。
 */

// CP 金额在 API 层用 number(整数 CP;2^53 CP ≈ 9×10^12 USD,M 级里程碑内安全)
export const profileSchema = z.object({
  user_id: z.string().min(1),
  email: z.email(),
  tier: z.string().min(1),
  privacy_mode: z.boolean(),
  pledge_limit_cp: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
});
export type Profile = z.infer<typeof profileSchema>;

/** M1 只开放 privacy_mode;pledge_limit_cp 随 M4 对战解锁(B4.1)。 */
export const updateProfileRequestSchema = z.object({
  privacy_mode: z.boolean(),
});

// -- 平台 token ---------------------------------------------------------------

export const platformTokenSchema = z.object({
  token_id: z.string().min(1),
  /** 展示用前缀(如 `mgw_a1b2…`),非哈希、不可逆推。 */
  token_prefix: z.string().min(1),
  created_at: z.iso.datetime({ offset: true }),
});
export type PlatformToken = z.infer<typeof platformTokenSchema>;

/** 签发响应:`token` 明文仅在此出现一次,客户端自行保存。 */
export const createTokenResponseSchema = platformTokenSchema.extend({
  token: z.string().min(1),
});

// -- 托管 Key ------------------------------------------------------------------

export const providerKeySchema = z.object({
  key_id: z.string().min(1),
  provider: providerSchema,
  /** 空数组 = 该 provider 全模型可用(与 Key 路由投影语义一致)。 */
  model_whitelist: z.array(z.string().min(1)),
  status: keyStatusSchema,
  last_verified_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
export type ProviderKey = z.infer<typeof providerKeySchema>;

export const createKeyRequestSchema = z.object({
  provider: providerSchema,
  /** provider key 明文,仅在此请求体出现;服务端信封加密落库(tech-design §2.1)。 */
  key: z.string().min(8),
  model_whitelist: z.array(z.string().min(1)).default([]),
});

export const updateKeyRequestSchema = z.object({
  model_whitelist: z.array(z.string().min(1)),
});
