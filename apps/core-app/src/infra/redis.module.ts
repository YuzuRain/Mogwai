import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";

export const REDIS = Symbol("REDIS");

// 环境变量名与 gateway 侧一致(gateway/plugins/mogwai_common.py):投影写读双方必须指向同一实例
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: () => new Redis(process.env.MOGWAI_REDIS_URL ?? "redis://localhost:6379/0"),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
