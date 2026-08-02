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
  // better-auth user 模型要求的字段(users 即 better-auth 的 user 表,adapter 映射)
  name: text("name").notNull().default(""),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 平台 token(gateway 数据面凭证,B4.1)。自研签发:网关只认 sha256 投影
 * (proj:token:<sha256>),依赖 better-auth api-key 插件的内部哈希格式反而引入
 * 脆弱耦合。明文不落库,只存 sha256 与展示前缀;吊销置 revoked_at,行保留审计。
 */
export const platformTokens = pgTable(
  "platform_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** sha256(完整 token) 的 hex,与 token 投影键一致(shared projections/token.ts)。 */
    tokenHash: text("token_hash").notNull().unique(),
    /** 展示用前缀(如 mgw_a1b2c3d4),不可逆推。 */
    tokenPrefix: text("token_prefix").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("platform_tokens_user_idx").on(t.userId)],
);

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
