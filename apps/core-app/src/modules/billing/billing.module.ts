import { Module } from "@nestjs/common";

import { SessionGuard } from "../../auth/session.guard.js";
import { AdminModule } from "../admin/admin.module.js";
import { BillingController } from "./billing.controller.js";
import { BillingConsumer } from "./consumer.js";
import { BillingReconciler } from "./reconciler.js";

/**
 * billing 模块:账本所有权方。
 * 消费者(BillingConsumer)与对账(BillingReconciler)只在 worker 入口运行
 * (B2 同代码不同入口);HTTP 模式仅暴露只读端点。
 * 配置读取经 AdminModule 公开 API,不直查 admin 表。
 */
@Module({
  imports: [AdminModule],
  controllers: [BillingController],
  providers: [BillingConsumer, BillingReconciler, SessionGuard],
  exports: [BillingConsumer, BillingReconciler],
})
export class BillingModule {}
