import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";

import { ApiError } from "../common/api-error.js";
import { AUTH, type Auth } from "./auth.module.js";

/** 已鉴权请求:guard 通过后 userId 一定存在。 */
export type AuthedRequest = Request & { userId: string };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      throw new ApiError("auth/unauthorized", "sign in required");
    }
    req.userId = session.user.id;
    return true;
  }
}
