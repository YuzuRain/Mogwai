/**
 * core-worker 入口(architecture B2:与 core-app 同代码、不同入口)。
 * 只跑事件消费者,不监听 HTTP。运行:pnpm --filter @mogwai/core-app worker
 */
import { hostname } from "node:os";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { BillingConsumer } from "./modules/billing/consumer.js";

const app = await NestFactory.createApplicationContext(AppModule);
const consumer = app.get(BillingConsumer);
const consumerName = `${hostname()}-${process.pid}`;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, draining consumer...`);
    consumer.stop();
  });
}

console.log(`core-worker: billing consumer '${consumerName}' starting`);
await consumer.run(consumerName);
await app.close();
console.log("core-worker: stopped");
