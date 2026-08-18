import { Module } from "@nestjs/common";

import { AccountModule } from "../account/account.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { OpsScheduler } from "./ops.scheduler.js";

@Module({
  imports: [AccountModule, BillingModule],
  providers: [OpsScheduler],
  exports: [OpsScheduler],
})
export class WorkersModule {}
