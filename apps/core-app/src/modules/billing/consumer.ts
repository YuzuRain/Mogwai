import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import type { Redis } from "ioredis";

import { evaluateCredit } from "@mogwai/formula-engine";
import {
  authorizationProjectionKey,
  authorizationProjectionSchema,
  creditFormulaConfigSchema,
  PLATFORM_USER_ID,
  priceTableConfigSchema,
  streamKey,
  usageCompletedSchema,
  type CreditFormulaRule,
  type UsageCompleted,
} from "@mogwai/shared";

import { DB, type Db } from "../../infra/db.module.js";
import { REDIS } from "../../infra/redis.module.js";
import { users } from "../account/schema.js";
import { AdminConfigService } from "../admin/config.service.js";
import { ledgerEntries } from "./schema.js";

const STREAM = streamKey("usage.completed");
const GROUP = "billing";
/** 业务性无法记账的事件进 DLQ(Redis list),由每日对账/人工处理;绝不静默丢弃。 */
export const BILLING_DLQ_KEY = "billing:dlq:usage.completed";
const CONFIG_CACHE_MS = 30_000;

/** 业务性拒绝(事件本身无法记账):DLQ + ack。基建故障则抛普通错误 → 不 ack,重试。 */
class DlqError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

interface BillingConfigs {
  formulaVersion: string;
  rules: CreditFormulaRule[];
  priceVersion: string;
  prices: Record<string, { input: number; output: number; cached: number }>;
}

/**
 * usage.completed → 公式求值 → 复式记账(B5.1 链路的 billing 段)。
 *
 * 可靠性语义:
 * - 幂等:(event_id, seq) 唯一键,重复消费触发 23505 → 直接 ack;
 * - 业务性无法记账(schema 违约 / 无价格 / 用户不存在 / 公式产出非法)→ DLQ + ack;
 * - 基建故障(DB/Redis 不可达)→ 不 ack,回到 PEL 重试,消费不前进;
 * - 每次成账后刷新该用户的授权投影(tech-design §2.5)。
 */
@Injectable()
export class BillingConsumer {
  private readonly logger = new Logger("BillingConsumer");
  private running = false;
  private configCache: { value: BillingConfigs; at: number } | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(AdminConfigService) private readonly config: AdminConfigService,
  ) {}

  /** 阻塞运行直到 stop();worker 入口调用(core-app HTTP 模式不启动,B2)。 */
  async run(consumerName: string): Promise<void> {
    this.running = true;
    const conn = this.redis.duplicate();
    try {
      await this.ensureGroup(conn);
      // 先清自己的 PEL(崩溃遗留),再消费新消息
      let backlog = true;
      while (this.running) {
        try {
          const messages = await this.read(conn, consumerName, backlog);
          if (backlog && messages.length === 0) {
            backlog = false;
            continue;
          }
          for (const [id, fields] of messages) {
            const acked = await this.processMessage(conn, id, fields);
            if (!acked) {
              // 基建故障:停止前进,退避后回 PEL 重试
              backlog = true;
              await sleep(1000);
              break;
            }
          }
        } catch (err) {
          if (!this.running) break;
          this.logger.error(`consumer loop error: ${err instanceof Error ? (err.stack ?? err.message) : err}`);
          backlog = true;
          await sleep(1000);
        }
      }
    } finally {
      conn.disconnect();
    }
  }

  stop(): void {
    this.running = false;
  }

  private async ensureGroup(conn: Redis): Promise<void> {
    try {
      // 从 0 开始:消费组创建前已发布的事件同样必须记账
      await conn.xgroup("CREATE", STREAM, GROUP, "0", "MKSTREAM");
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes("BUSYGROUP")) throw err;
    }
  }

  private async read(
    conn: Redis,
    consumerName: string,
    backlog: boolean,
  ): Promise<Array<[string, string[]]>> {
    const resp = (await (backlog
      ? conn.xreadgroup("GROUP", GROUP, consumerName, "COUNT", 32, "STREAMS", STREAM, "0")
      : conn.xreadgroup(
          "GROUP",
          GROUP,
          consumerName,
          "COUNT",
          32,
          "BLOCK",
          2000,
          "STREAMS",
          STREAM,
          ">",
        ))) as Array<[string, Array<[string, string[]]>]> | null;
    return resp?.[0]?.[1] ?? [];
  }

  /** 返回 true = 已 ack(记账成功 / 幂等重复 / 已进 DLQ);false = 基建故障需重试。 */
  private async processMessage(conn: Redis, messageId: string, fields: string[]): Promise<boolean> {
    try {
      await this.handleEvent(fields);
      await conn.xack(STREAM, GROUP, messageId);
      return true;
    } catch (err) {
      if (err instanceof DlqError) {
        await this.redis.lpush(
          BILLING_DLQ_KEY,
          JSON.stringify({
            reason: err.reason,
            message: err.message,
            stream_message_id: messageId,
            fields,
            ts: new Date().toISOString(),
          }),
        );
        this.logger.error(`event → DLQ (${err.reason}): ${err.message}`);
        await conn.xack(STREAM, GROUP, messageId);
        return true;
      }
      if (isPgError(err, "23505")) {
        // (event_id, seq) 幂等键命中:早已记账,重复投递
        await conn.xack(STREAM, GROUP, messageId);
        return true;
      }
      this.logger.error(
        `infra error, will retry: ${err instanceof Error ? (err.stack ?? err.message) : err}`,
      );
      return false;
    }
  }

  private async handleEvent(fields: string[]): Promise<void> {
    const payloadIdx = fields.indexOf("payload");
    if (payloadIdx === -1 || fields[payloadIdx + 1] === undefined) {
      throw new DlqError("malformed_message", "stream message has no payload field");
    }
    let event: UsageCompleted;
    try {
      event = usageCompletedSchema.parse(JSON.parse(fields[payloadIdx + 1]!));
    } catch (err) {
      throw new DlqError("schema_violation", `usage.completed schema violation: ${err}`);
    }

    if (event.key_source !== "byok") {
      // CP 直购(platform Key 池)随 M4 支付启用;在此之前出现即为异常流量
      throw new DlqError("key_source_not_implemented", `key_source=${event.key_source} billing is M4 (event ${event.event_id})`);
    }

    const configs = await this.loadConfigs();
    const rule = matchRule(configs.rules, event.provider, event.model);
    const price = configs.prices[`${event.provider}/${event.model}`];
    if (!price) {
      throw new DlqError(
        "price_missing",
        `no price for ${event.provider}/${event.model} in price_table ${configs.priceVersion} (event ${event.event_id})`,
      );
    }

    // 规则变量在前、事件事实在后:tokens/price 永远以权威来源为准,不可被规则覆盖
    const vars: Record<string, number> = {
      ...rule.variables,
      input_tokens: event.input_tokens,
      output_tokens: event.output_tokens,
      cached_tokens: event.cached_tokens,
      "price.input": price.input,
      "price.output": price.output,
      "price.cached": price.cached,
    };

    let creditCost: number;
    try {
      creditCost = evaluateCredit(rule.expression, vars).creditCost;
    } catch (err) {
      throw new DlqError("formula_error", `formula eval failed (event ${event.event_id}): ${err}`);
    }
    if (!Number.isInteger(creditCost) || creditCost < 0) {
      throw new DlqError(
        "formula_error",
        `formula produced invalid credit ${creditCost} (event ${event.event_id}); expression must yield a nonnegative integer (use ceil)`,
      );
    }
    if (creditCost === 0) return; // 零成本调用不产生分录(delta≠0 约束)

    const txnId = randomUUID();
    const snapshot = {
      scope: rule.scope,
      expression: rule.expression,
      variables: vars,
      price_table_version: configs.priceVersion,
      credit: creditCost,
    };
    const shared = {
      txnId,
      eventId: event.event_id,
      reason: "usage_service_fee",
      refType: "usage",
      refId: event.request_id,
      formulaVersion: configs.formulaVersion,
      snapshot,
    };
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(ledgerEntries).values([
          {
            ...shared,
            seq: 0,
            userId: event.user_id,
            account: "service_fee",
            counterpartyId: PLATFORM_USER_ID,
            deltaCp: -BigInt(creditCost),
          },
          {
            ...shared,
            seq: 1,
            userId: PLATFORM_USER_ID,
            account: "service_fee",
            counterpartyId: event.user_id,
            deltaCp: BigInt(creditCost),
          },
        ]);
      });
    } catch (err) {
      if (isPgError(err, "23503")) {
        throw new DlqError("unknown_user", `user ${event.user_id} not in users table (event ${event.event_id})`);
      }
      throw err; // 23505(幂等)与基建故障由 processMessage 分类
    }

    await this.refreshAuthzProjection(event.user_id);
  }

  /** 账本变动后刷新授权投影(§2.5)。债权债务随 M4 对战结算;blocked 阈值见 REVIEW Block 15。 */
  private async refreshAuthzProjection(userId: string): Promise<void> {
    const [user] = await this.db
      .select({ pledgeLimitCp: users.pledgeLimitCp })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new Error(`authz refresh: user ${userId} vanished`);

    const nets = await this.db
      .select({
        account: ledgerEntries.account,
        net: sql<string>`sum(${ledgerEntries.deltaCp})`,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.userId, userId))
      .groupBy(ledgerEntries.account);
    const net = (account: string) => Number(nets.find((n) => n.account === account)?.net ?? 0);

    const projection = authorizationProjectionSchema.parse({
      service_fee_owed_cp: Math.max(0, -net("service_fee")),
      pledge_available_cp: Math.max(0, Number(user.pledgeLimitCp) - net("pledge")),
      debts: [],
      credits: [],
      blocked: false,
    });
    await this.redis.set(authorizationProjectionKey(userId), JSON.stringify(projection));
  }

  private async loadConfigs(): Promise<BillingConfigs> {
    if (this.configCache && Date.now() - this.configCache.at < CONFIG_CACHE_MS) {
      return this.configCache.value;
    }
    const [formula, priceTable] = await Promise.all([
      this.config.getActive("credit_formula"),
      this.config.getActive("price_table"),
    ]);
    const value: BillingConfigs = {
      formulaVersion: formula.version,
      rules: creditFormulaConfigSchema.parse(formula.payload).rules,
      priceVersion: priceTable.version,
      prices: priceTableConfigSchema.parse(priceTable.payload).prices,
    };
    this.configCache = { value, at: Date.now() };
    return value;
  }
}

/** 匹配优先级 model > provider > global,命中即停(tech-design §3.4)。 */
function matchRule(rules: CreditFormulaRule[], provider: string, model: string): CreditFormulaRule {
  const modelScope = `model:${provider}/${model}`;
  const providerScope = `provider:${provider}`;
  const rule =
    rules.find((r) => r.scope === modelScope) ??
    rules.find((r) => r.scope === providerScope) ??
    rules.find((r) => r.scope === "global");
  if (!rule) throw new Error("credit_formula config has no global rule (schema should prevent this)");
  return rule;
}

function isPgError(err: unknown, code: string): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if ((e as { code?: string }).code === code) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
