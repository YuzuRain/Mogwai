import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { DbModule } from "./infra/db.module.js";
import { RedisModule } from "./infra/redis.module.js";
import { AccountModule } from "./modules/account/account.module.js";

@Module({
  imports: [DbModule, RedisModule, AuthModule, AccountModule],
})
export class AppModule {}
