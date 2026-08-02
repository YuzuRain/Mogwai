import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";

import type { ApiErrorCode } from "@mogwai/shared";

import { ApiError } from "./api-error.js";

/** 统一错误信封(B4.1):`{ error: { code, message, details? } }`,code 只出注册表。 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiError) {
      res.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details !== undefined ? { details: exception.details } : {}),
        },
      });
      return;
    }

    // Nest 框架异常(未知路由 404 等)映射到注册表中的等价码
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ApiErrorCode =
        status === 404
          ? "resource/not_found"
          : status === 401
            ? "auth/unauthorized"
            : status === 403
              ? "auth/forbidden"
              : "internal/error";
      if (code === "internal/error") {
        this.logger.error(`unmapped HttpException ${status}`, exception.stack);
        res.status(500).json({ error: { code, message: "internal error" } });
        return;
      }
      res.status(status).json({ error: { code, message: exception.message } });
      return;
    }

    // 未知异常:响亮记录堆栈,永不把内部细节泄给客户端
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    res.status(500).json({ error: { code: "internal/error", message: "internal error" } });
  }
}
