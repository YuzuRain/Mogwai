import { z } from "zod";

/**
 * Key 路由投影(architecture A4 投影 2)—— account 在 Key 录入/状态变更时写入,
 * 网关 key_resolver 只读。Redis string(JSON 数组),键:`proj:keys:<user_id>`。
 * 密文为信封加密产物(tech-design §2.1),网关内存中解密、用完即弃。
 */
export const keyRoutingEntrySchema = z.object({
  /** provider_keys.id,冲销记账与审计时引用。 */
  key_id: z.string().min(1),
  provider: z.string().min(1),
  /** base64(12B GCM nonce) */
  nonce: z.base64(),
  /** base64(AES-256-GCM ciphertext) */
  ciphertext: z.base64(),
  /**
   * base64(KMS 加密后的 DEK);信封加密的外层。线格式随 KMS 后端而定
   * (gateway/plugins/kms.py):env_kek = base64(12B nonce ‖ GCM 密文),
   * openbao_transit = base64("vault:v1:..."),account 写入与 gateway 解包必须一致。
   */
  encrypted_dek: z.base64(),
  model_whitelist: z.array(z.string().min(1)),
});

export const keyRoutingProjectionSchema = z.array(keyRoutingEntrySchema);

export type KeyRoutingEntry = z.infer<typeof keyRoutingEntrySchema>;
export type KeyRoutingProjection = z.infer<typeof keyRoutingProjectionSchema>;

export function keyRoutingProjectionKey(userId: string): string {
  return `proj:keys:${userId}`;
}
