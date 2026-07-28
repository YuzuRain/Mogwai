import { z } from "zod";

/**
 * 管理面 API 错误码注册表(architecture B4.1)。
 * 错误码 = `域/原因`,值 = HTTP 状态。新增错误码只允许加进这里,
 * 服务端与前端禁止散落字面量。
 */
export const API_ERROR_CODES = {
  "auth/unauthorized": 401,
  "auth/forbidden": 403,
  "resource/not_found": 404,
  "config/active_conflict": 409, // 同 namespace 已有 active(activate 竞争)
  "config/not_draft": 409, // 只有 draft 可以 activate
  "config/payload_schema_missing": 422, // namespace 尚未定义 payload schema,拒写
  "validation/invalid_request": 422, // zod 校验失败,details 带 issues
  "internal/error": 500,
} as const satisfies Record<string, number>;

export type ApiErrorCode = keyof typeof API_ERROR_CODES;

const codes = Object.keys(API_ERROR_CODES) as [ApiErrorCode, ...ApiErrorCode[]];

/** 错误统一信封:`{ error: { code, message, details? } }`。 */
export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(codes),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
