import { Inject, Injectable, Logger } from "@nestjs/common";
import { Queue, Worker } from "bullmq";

import { AccountService } from "../account/account.service.js";
import { BillingReconciler } from "../billing/reconciler.js";

const OPS_QUEUE = "ops";

/**
 * 定时运维任务调度(architecture #8:BullMQ)。只做编排,不碰数据——
 * 业务逻辑在所属模块的公开 API 上(Key 巡检归 account,对账归 billing)。
 * repeatable job 由 BullMQ 全局去重:多 worker 副本不会重复执行同一次调度。
 * 仅 worker 入口调用 start()(B2 同代码不同入口)。
 */
@Injectable()
export class OpsScheduler {
  private readonly logger = new Logger("OpsScheduler");
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    @Inject(AccountService) private readonly account: AccountService,
    @Inject(BillingReconciler) private readonly reconciler: BillingReconciler,
  ) {}

  async start(): Promise<void> {
    // BullMQ 要求专用连接(阻塞命令),不与投影读写共享 REDIS 实例
    const connection = {
      url: process.env.MOGWAI_REDIS_URL ?? "redis://localhost:6379/0",
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue(OPS_QUEUE, { connection });

    // Key 健康巡检:每 6h(tech-design §2.1)
    await this.queue.upsertJobScheduler("key-patrol", { every: 6 * 3600_000 }, { name: "key-patrol" });
    // 每日对账:03:00(tech-design §2.3,M1 范围 stream ↔ ledger)
    await this.queue.upsertJobScheduler(
      "billing-reconcile",
      { pattern: "0 3 * * *" },
      { name: "billing-reconcile" },
    );

    this.worker = new Worker(
      OPS_QUEUE,
      async (job) => {
        switch (job.name) {
          case "key-patrol": {
            const summary = await this.account.patrolKeys();
            this.logger.log(`key-patrol: ${JSON.stringify(summary)}`);
            return summary;
          }
          case "billing-reconcile":
            return await this.reconciler.reconcile();
          default:
            throw new Error(`ops: unknown job '${job.name}' — scheduler/worker drift`);
        }
      },
      { connection },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(`ops job '${job?.name}' failed: ${err.stack ?? err.message}`);
    });
    this.logger.log("ops scheduler started (key-patrol @6h, billing-reconcile @daily 03:00)");
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
