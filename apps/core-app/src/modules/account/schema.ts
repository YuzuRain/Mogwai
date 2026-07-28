import { KEY_STATUSES } from "@mogwai/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * account 模块所属表(architecture B2:表归模块所有,禁止跨模块直查)。
 * 结构权威:architecture B3;枚举单一权威在 @mogwai/shared(domain/providers.ts)。
 * users 内置 PLATFORM 哨兵行(shared PLATFORM_USER_ID),0001 迁移写入。
 */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  tier: text("tier").notNull().default("standard"),
  privacyMode: boolean("privacy_mode").notNull().default(false),
  /** 用户自设的对战担保额度上限;可用额度 = 此值 − pledge 科目净头寸(§3.5)。 */
  pledgeLimitCp: bigint("pledge_limit_cp", { mode: "bigint" })
    .notNull()
    .default(sql`0`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerKeys = pgTable(
  "provider_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull(),
    // 信封加密三件套,与 Key 路由投影同构(shared projections/key-routing.ts):
    // 数据库与投影永不落明文,线格式契约见 gateway/plugins/kms.py
    encryptedDek: text("encrypted_dek").notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    modelWhitelist: jsonb("model_whitelist").notNull().default([]),
    status: text("status").notNull().default("pending_verify"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("provider_keys_user_idx").on(t.userId),
    // 与 shared KEY_STATUSES 同源构造,渲染文本与既有迁移一致(不产生 ALTER)
    check(
      "provider_keys_status_check",
      sql`${t.status} in (${sql.raw(KEY_STATUSES.map((s) => `'${s}'`).join(", "))})`,
    ),
  ],
);
