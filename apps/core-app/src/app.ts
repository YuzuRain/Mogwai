import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";
import { json } from "express";

import { AppModule } from "./app.module.js";
import { AUTH, type Auth } from "./auth/auth.module.js";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";

/**
 * 应用装配(main.ts 与集成测试共用)。
 * better-auth 处理器必须先于 json body parser 挂载(需要原始请求体);
 * express 挂载点的前缀剥离由 better-call 的 node 适配器自行还原
 * (读 req.baseUrl/originalUrl,勿手动改写 req.url,会把路径拼坏)。
 */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: ["error", "warn", "log"],
  });

  const auth = app.get<Auth>(AUTH);
  const authHandler = toNodeHandler(auth);
  const express = app.getHttpAdapter().getInstance();
  express.use("/api/auth", (req, res) => {
    void authHandler(req, res);
  });

  app.use(json());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
