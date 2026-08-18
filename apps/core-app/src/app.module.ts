import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { DbModule } from "./infra/db.module.js";
import { RedisModule } from "./infra/redis.module.js";
import { AccountModule } from "./modules/account/account.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { BillingModule } from "./modules/billing/billing.module.js";
import { WorkersModule } from "./modules/workers/workers.module.js";

@Module({
  imports: [DbModule, RedisModule, AuthModule, AccountModule, AdminModule, BillingModule, WorkersModule],
})
export class AppModule {}
