import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import type { Redis } from "ioredis";

import {
  keyRoutingProjectionKey,
  keyRoutingProjectionSchema,
  tokenProjectionKey,
  tokenProjectionSchema,
  type KeyRoutingProjection,
  type TokenProjection,
} from "@mogwai/shared";

import { DB, type Db } from "../../infra/db.module.js";
import { REDIS } from "../../infra/redis.module.js";
import { platformTokens, providerKeys } from "./schema.js";

/**
 * account 拥有的两个 Redis 投影(architecture A4 投影 1/2)的唯一写入方。
 * 写入前一律过 shared schema 校验——投影格式违约在写侧就炸,不留给网关。
 *
 * 一致性纪律(B4.1:投影是端点的同步副作用):
 * - 授权收紧(吊销/降级)先动投影再动 DB —— 失败方向是“网关拒绝但 DB 未记”,fail-closed;
 * - 授权放开(签发/激活)先动 DB 再动投影 —— 失败方向是“DB 已记但网关不认”,同样 fail-closed;
 * - 任一步失败都向调用方抛错(请求 5xx,可重试),不静默吞。
 */
@Injectable()
export class ProjectionsService {
  private readonly logger = new Logger("ProjectionsService");

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DB) private readonly db: Db,
  ) {}

  async writeTokenProjection(tokenSha256Hex: string, userId: string, privacyMode: boolean): Promise<void> {
    const projection: TokenProjection = tokenProjectionSchema.parse({
      user_id: userId,
      privacy_mode: privacyMode ? "1" : "0",
      blocked: "0",
    });
    await this.redis.hset(tokenProjectionKey(tokenSha256Hex), projection);
  }

  async dropTokenProjection(tokenSha256Hex: string): Promise<void> {
    await this.redis.del(tokenProjectionKey(tokenSha256Hex));
  }

  /**
   * privacy_mode 变更:同步该用户全部在用 token 的投影。
   * 只改 privacy_mode 字段,blocked 标记归 billing 所有,不碰。
   * 投影意外缺失(漂移)→ 响亮报错并按 account 权威数据重建(blocked 重置为 "0",
   * billing 侧账本变动后会重新下发拒绝标记,tech-design §2.5)。
   */
  async syncTokenPrivacy(userId: string, privacyMode: boolean): Promise<void> {
    const tokens = await this.db
      .select({ tokenHash: platformTokens.tokenHash })
      .from(platformTokens)
      .where(and(eq(platformTokens.userId, userId), isNull(platformTokens.revokedAt)));

    for (const { tokenHash } of tokens) {
      const key = tokenProjectionKey(tokenHash);
      const exists = await this.redis.exists(key);
      if (!exists) {
        this.logger.error(`token projection missing for active token (drift), rebuilding: ${key}`);
        await this.writeTokenProjection(tokenHash, userId, privacyMode);
        continue;
      }
      await this.redis.hset(key, { privacy_mode: privacyMode ? "1" : "0" });
    }
  }

  /** Key 路由投影整体重建:以 DB 中 active 状态的 Key 为准,幂等。 */
  async rebuildKeyRouting(userId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(providerKeys)
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.status, "active")));

    const key = keyRoutingProjectionKey(userId);
    if (rows.length === 0) {
      await this.redis.del(key);
      return;
    }
    const projection: KeyRoutingProjection = keyRoutingProjectionSchema.parse(
      rows.map((row) => ({
        key_id: row.id,
        provider: row.provider,
        nonce: row.nonce,
        ciphertext: row.ciphertext,
        encrypted_dek: row.encryptedDek,
        model_whitelist: row.modelWhitelist as string[],
      })),
    );
    await this.redis.set(key, JSON.stringify(projection));
  }
}
