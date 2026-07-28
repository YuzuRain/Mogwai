import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * admin 模块:配置中心(architecture B3;tech-design §3.4 版本化与生效)。
 * payload 的 schema 按 namespace 在 packages/shared 定义
 * (credit_formula → creditFormulaConfigSchema),写入方校验后入库。
 */
export const configVersions = pgTable(
  "config_versions",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    /** 合法值见 shared CONFIG_NAMESPACES;应用层校验,不做 DB 枚举(新增 namespace 免迁移)。 */
    namespace: text("namespace").notNull(),
    version: text("version").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("draft"),
    grayRatio: real("gray_ratio"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("config_namespace_version_uq").on(t.namespace, t.version),
    // 同 namespace 同时只允许一个 active(§3.4);灰度版本以 gray 状态并存
    uniqueIndex("config_single_active_uq")
      .on(t.namespace)
      .where(sql`${t.status} = 'active'`),
    check(
      "config_status_check",
      sql`${t.status} in ('draft', 'gray', 'active', 'retired')`,
    ),
  ],
);
