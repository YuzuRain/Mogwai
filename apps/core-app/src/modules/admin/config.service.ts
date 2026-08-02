import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import type { ConfigNamespace } from "@mogwai/shared";

import { DB, type Db } from "../../infra/db.module.js";
import { configVersions } from "./schema.js";

export interface ActiveConfig {
  version: string;
  payload: unknown;
}

/**
 * admin 模块的公开 API:config_versions 归 admin 所有(B2 铁律),
 * billing 等模块只能经此读取,禁止直查表。
 */
@Injectable()
export class AdminConfigService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 读取 namespace 当前 active 版本;不存在即抛错(计费等消费方没有兜底可言)。 */
  async getActive(namespace: ConfigNamespace): Promise<ActiveConfig> {
    const [row] = await this.db
      .select({ version: configVersions.version, payload: configVersions.payload })
      .from(configVersions)
      .where(and(eq(configVersions.namespace, namespace), eq(configVersions.status, "active")));
    if (!row) {
      throw new Error(`config: no active version for namespace '${namespace}' (run db:seed?)`);
    }
    return row;
  }
}
