import type { z } from "zod";

import { apiErrorEnvelopeSchema } from "@mogwai/shared";

/**
 * 管理面 API client。契约纪律与服务端 toDto 对称:
 * - 响应体过 shared zod schema,契约不符当场抛错(而不是渲染坏数据);
 * - 非 2xx 解析统一错误信封,以结构化 code 抛 ApiError,页面按 code 分支。
 * 所有请求走同源 `/api/*`(next.config 反代),cookie 自动携带。
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T extends z.ZodType>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const resp = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (resp.status === 204) return schema.parse(undefined);
  const body: unknown = await resp.json().catch(() => undefined);
  if (!resp.ok) {
    const parsed = apiErrorEnvelopeSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiError(
        parsed.data.error.code,
        parsed.data.error.message,
        resp.status,
        parsed.data.error.details,
      );
    }
    throw new ApiError("unknown/unparsed", `HTTP ${resp.status}`, resp.status, body);
  }
  return schema.parse(body);
}

export async function apiVoid(path: string, init?: RequestInit): Promise<void> {
  const resp = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (resp.ok) return;
  const body: unknown = await resp.json().catch(() => undefined);
  const parsed = apiErrorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    throw new ApiError(
      parsed.data.error.code,
      parsed.data.error.message,
      resp.status,
      parsed.data.error.details,
    );
  }
  throw new ApiError("unknown/unparsed", `HTTP ${resp.status}`, resp.status, body);
}
