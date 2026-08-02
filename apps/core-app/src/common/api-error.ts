import { API_ERROR_CODES, type ApiErrorCode } from "@mogwai/shared";

/** 业务错误:错误码必须来自 shared 注册表(B4.1),HTTP 状态由注册表决定。 */
export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = API_ERROR_CODES[code];
  }
}
