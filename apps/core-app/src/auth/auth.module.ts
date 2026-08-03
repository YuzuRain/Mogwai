import { Global, Module } from "@nestjs/common";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { authAccounts, authSessions, authVerifications } from "../modules/account/auth-schema.js";
import { users } from "../modules/account/schema.js";
import { DB, type Db } from "../infra/db.module.js";

/**
 * better-auth 实例(B4.1:管理面鉴权 = session cookie,auth 端点托管在 /api/auth/*)。
 * user 模型复用 account 模块的 users 表;实例挂载见 app.ts。
 */
export function createAuth(db: Db) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("auth: BETTER_AUTH_SECRET is required in production");
  }
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    basePath: "/api/auth",
    // web 经 Next 反代同源调用(architecture B4.1),但浏览器 Origin 头仍是
    // web 自己的地址——better-auth 按 Origin 校验 CSRF,须显式信任 web 源;
    // 生产以 MOGWAI_WEB_ORIGIN 注入,缺省仅本地开发端口。
    trustedOrigins: [process.env.MOGWAI_WEB_ORIGIN ?? "http://localhost:3100"],
    secret: secret ?? "mogwai-dev-only-secret",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: { enabled: true },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const AUTH = Symbol("AUTH");

@Global()
@Module({
  providers: [{ provide: AUTH, useFactory: (db: Db) => createAuth(db), inject: [DB] }],
  exports: [AUTH],
})
export class AuthModule {}
