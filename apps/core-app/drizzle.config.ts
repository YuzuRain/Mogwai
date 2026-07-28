import { defineConfig } from "drizzle-kit";

// 迁移产物按 architecture B1 统一放 infra/migrations,由 drizzle-kit 管理。
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/*/schema.ts",
  out: "../../infra/migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://mogwai:mogwai_dev@localhost:5432/mogwai",
  },
});
