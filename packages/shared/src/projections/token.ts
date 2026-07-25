import { z } from "zod";

/**
 * 平台 token 投影(architecture A4 投影 1)—— account 在 token 签发/变更时写入,
 * 网关 platform_auth 只读。Redis hash,键:`proj:token:<sha256(token)>`。
 * Redis hash 值一律为字符串,布尔用 "0"/"1"。
 */
export const tokenProjectionSchema = z.object({
  user_id: z.string().min(1),
  privacy_mode: z.enum(["0", "1"]),
  /** billing 下发的拒绝标记(欠费越限熔断,tech-design §2.5)。 */
  blocked: z.enum(["0", "1"]),
  /** 限流参数(LiteLLM rpm/tpm,architecture A3 #3);缺省走全局默认。 */
  rpm: z.string().regex(/^\d+$/).optional(),
  tpm: z.string().regex(/^\d+$/).optional(),
});

export type TokenProjection = z.infer<typeof tokenProjectionSchema>;

export function tokenProjectionKey(tokenSha256Hex: string): string {
  return `proj:token:${tokenSha256Hex}`;
}
