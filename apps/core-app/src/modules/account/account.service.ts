import { randomBytes, createHash } from "node:crypto";

import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import { keyRoutingProjectionKey, keyRoutingProjectionSchema, type Provider } from "@mogwai/shared";
import type { Redis } from "ioredis";

import { ApiError } from "../../common/api-error.js";
import { DB, type Db } from "../../infra/db.module.js";
import { REDIS } from "../../infra/redis.module.js";
import { envelopeDecrypt, envelopeEncrypt } from "./envelope.js";
import { probeProviderKey } from "./key-verifier.js";
import { ProjectionsService } from "./projections.service.js";
import { platformTokens, providerKeys, users } from "./schema.js";

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

@Injectable()
export class AccountService implements OnApplicationBootstrap {
  private readonly logger = new Logger("AccountService");

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ProjectionsService) private readonly projections: ProjectionsService,
  ) {}

  /** 崩溃恢复:探测中断的 Key 停在 pending_verify,启动时重扫(定期巡检随 workers,§2.1)。 */
  async onApplicationBootstrap(): Promise<void> {
    const pending = await this.db
      .select({ id: providerKeys.id })
      .from(providerKeys)
      .where(eq(providerKeys.status, "pending_verify"));
    for (const { id } of pending) {
      void this.verifyKey(id).catch((err) =>
        this.logger.error(`boot sweep verify ${id} failed: ${err}`),
      );
    }
  }

  // -- profile -----------------------------------------------------------------

  async getProfile(userId: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!row) throw new ApiError("resource/not_found", "user not found");
    return {
      user_id: row.id,
      email: row.email,
      tier: row.tier,
      privacy_mode: row.privacyMode,
      pledge_limit_cp: Number(row.pledgeLimitCp),
      created_at: row.createdAt.toISOString(),
    };
  }

  async updatePrivacyMode(userId: string, privacyMode: boolean) {
    await this.db.update(users).set({ privacyMode }).where(eq(users.id, userId));
    await this.projections.syncTokenPrivacy(userId, privacyMode);
    return this.getProfile(userId);
  }

  // -- platform tokens -----------------------------------------------------------

  async listTokens(userId: string) {
    const rows = await this.db
      .select()
      .from(platformTokens)
      .where(and(eq(platformTokens.userId, userId), isNull(platformTokens.revokedAt)));
    return rows.map((row) => this.tokenDto(row));
  }

  async createToken(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new ApiError("resource/not_found", "user not found");

    const token = `mgw_${randomBytes(32).toString("base64url")}`;
    const row = {
      id: newId("tok"),
      userId,
      tokenHash: sha256Hex(token),
      tokenPrefix: token.slice(0, 12),
    };
    await this.db.insert(platformTokens).values(row);
    try {
      // 放开授权:先 DB 后投影(投影失败 → 网关不认,fail-closed,回滚 DB 行后报错重试)
      await this.projections.writeTokenProjection(row.tokenHash, userId, user.privacyMode);
    } catch (err) {
      await this.db.delete(platformTokens).where(eq(platformTokens.id, row.id));
      throw err;
    }
    const [inserted] = await this.db
      .select()
      .from(platformTokens)
      .where(eq(platformTokens.id, row.id));
    return { ...this.tokenDto(inserted!), token };
  }

  async revokeToken(userId: string, tokenId: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(platformTokens)
      .where(
        and(
          eq(platformTokens.id, tokenId),
          eq(platformTokens.userId, userId),
          isNull(platformTokens.revokedAt),
        ),
      );
    if (!row) throw new ApiError("resource/not_found", "token not found");
    // 收紧授权:先投影后 DB(任一失败都 fail-closed)
    await this.projections.dropTokenProjection(row.tokenHash);
    await this.db
      .update(platformTokens)
      .set({ revokedAt: new Date() })
      .where(eq(platformTokens.id, tokenId));
  }

  private tokenDto(row: typeof platformTokens.$inferSelect) {
    return {
      token_id: row.id,
      token_prefix: row.tokenPrefix,
      created_at: row.createdAt.toISOString(),
    };
  }

  // -- provider keys ---------------------------------------------------------------

  async listKeys(userId: string) {
    const rows = await this.db
      .select()
      .from(providerKeys)
      .where(and(eq(providerKeys.userId, userId)));
    return rows.filter((r) => r.status !== "revoked").map((row) => this.keyDto(row));
  }

  async createKey(userId: string, input: { provider: Provider; key: string; model_whitelist: string[] }) {
    const sealed = envelopeEncrypt(input.key);
    const row = {
      id: newId("key"),
      userId,
      provider: input.provider,
      encryptedDek: sealed.encryptedDek,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      modelWhitelist: input.model_whitelist,
    };
    await this.db.insert(providerKeys).values(row);
    // 录入即异步校验(§2.1);失败路径由状态机 + 启动扫描承接,请求不阻塞
    void this.verifyKey(row.id).catch((err) =>
      this.logger.error(`async verify ${row.id} failed: ${err}`),
    );
    const [inserted] = await this.db.select().from(providerKeys).where(eq(providerKeys.id, row.id));
    return this.keyDto(inserted!);
  }

  async updateKeyWhitelist(userId: string, keyId: string, whitelist: string[]) {
    const row = await this.ownedKey(userId, keyId);
    await this.db
      .update(providerKeys)
      .set({ modelWhitelist: whitelist })
      .where(eq(providerKeys.id, row.id));
    if (row.status === "active") {
      await this.projections.rebuildKeyRouting(userId);
    }
    const [updated] = await this.db.select().from(providerKeys).where(eq(providerKeys.id, row.id));
    return this.keyDto(updated!);
  }

  async revokeKey(userId: string, keyId: string): Promise<void> {
    const row = await this.ownedKey(userId, keyId);
    // 收紧授权:先把该 Key 从路由投影里剔除,再动 DB(fail-closed)
    await this.dropKeyFromRouting(userId, row.id);
    await this.db
      .update(providerKeys)
      .set({ status: "revoked" })
      .where(eq(providerKeys.id, row.id));
  }

  /** 探测并推进状态机:ok → active + 投影;unauthorized → invalid;unreachable → 原地等待重试。 */
  async verifyKey(keyId: string): Promise<void> {
    const [row] = await this.db.select().from(providerKeys).where(eq(providerKeys.id, keyId));
    if (!row || row.status !== "pending_verify") return;

    const plaintext = envelopeDecrypt({
      nonce: row.nonce,
      ciphertext: row.ciphertext,
      encryptedDek: row.encryptedDek,
    });
    const result = await probeProviderKey(row.provider as Provider, plaintext);
    if (result === "ok") {
      await this.db
        .update(providerKeys)
        .set({ status: "active", lastVerifiedAt: new Date() })
        .where(eq(providerKeys.id, keyId));
      await this.projections.rebuildKeyRouting(row.userId);
    } else if (result === "unauthorized") {
      await this.db.update(providerKeys).set({ status: "invalid" }).where(eq(providerKeys.id, keyId));
    }
    // unreachable:保持 pending_verify,key-verifier 已留 ERROR 日志
  }

  private async ownedKey(userId: string, keyId: string) {
    const [row] = await this.db
      .select()
      .from(providerKeys)
      .where(and(eq(providerKeys.id, keyId), eq(providerKeys.userId, userId)));
    if (!row || row.status === "revoked") {
      throw new ApiError("resource/not_found", "key not found");
    }
    return row;
  }

  /** 从路由投影中剔除单个 Key(不等 DB 落地,吊销路径的先手动作)。 */
  private async dropKeyFromRouting(userId: string, keyId: string): Promise<void> {
    const redisKey = keyRoutingProjectionKey(userId);
    const raw = await this.redis.get(redisKey);
    if (raw === null) return;
    const entries = keyRoutingProjectionSchema.parse(JSON.parse(raw)).filter((e) => e.key_id !== keyId);
    if (entries.length === 0) {
      await this.redis.del(redisKey);
    } else {
      await this.redis.set(redisKey, JSON.stringify(entries));
    }
  }

  private keyDto(row: typeof providerKeys.$inferSelect) {
    return {
      key_id: row.id,
      provider: row.provider,
      model_whitelist: row.modelWhitelist as string[],
      status: row.status,
      last_verified_at: row.lastVerifiedAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
