import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export const PG_POOL = Symbol("PG_POOL");
export const DB = Symbol("DB");

export type Db = NodePgDatabase;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          connectionString:
            process.env.DATABASE_URL ?? "postgres://mogwai:mogwai_dev@localhost:5432/mogwai",
        }),
    },
    {
      provide: DB,
      useFactory: (pool: Pool) => drizzle(pool),
      inject: [PG_POOL],
    },
  ],
  exports: [PG_POOL, DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
