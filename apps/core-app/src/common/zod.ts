import type { z } from "zod";

import { ApiError } from "./api-error.js";

/** 入参校验:失败 → 422 validation/invalid_request,details 携带 zod issues(B4.1)。 */
export function parseRequest<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError("validation/invalid_request", "request validation failed", result.error.issues);
  }
  return result.data;
}

/**
 * 出参校验:响应发出前过一遍契约 schema。失败说明服务端违约(shared DTO 与
 * 实现脱节),抛普通 Error → 500 并留堆栈,绝不带病返回。
 */
export function toDto<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`response DTO violates shared contract: ${result.error.message}`);
  }
  return result.data;
}
