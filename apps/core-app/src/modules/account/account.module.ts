import { Module } from "@nestjs/common";

import { SessionGuard } from "../../auth/session.guard.js";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";
import { ProjectionsService } from "./projections.service.js";

@Module({
  controllers: [AccountController],
  providers: [AccountService, ProjectionsService, SessionGuard],
})
export class AccountModule {}
