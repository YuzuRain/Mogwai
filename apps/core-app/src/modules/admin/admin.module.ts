import { Module } from "@nestjs/common";

import { AdminConfigService } from "./config.service.js";

/** admin 模块:配置中心所有权方。管理端点(B4.1 admin 三端点)随 admin 角色机制落地。 */
@Module({
  providers: [AdminConfigService],
  exports: [AdminConfigService],
})
export class AdminModule {}
