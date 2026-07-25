/**
 * 把 zod 权威契约导出为 JSON Schema 工件(schemas/json/),
 * 供非 TS 侧(gateway 的 Python 插件)校验使用(architecture A5)。
 * 工件随源码提交:变更 schema 必须重新导出,测试会校验两者同步。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
// 从构建产物导入(node 原生 type-stripping 不解析 .js→.ts 源码映射);
// turbo 已声明 export:schemas 依赖 build。
import {
  authorizationProjectionSchema,
  eventSchemas,
  keyRoutingProjectionSchema,
  tokenProjectionSchema,
} from "../dist/index.js";

const outRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas", "json");

const projectionSchemas = {
  "token-projection": tokenProjectionSchema,
  "key-routing-projection": keyRoutingProjectionSchema,
  "authorization-projection": authorizationProjectionSchema,
} as const;

function write(relPath: string, schema: z.ZodType): void {
  const target = join(outRoot, relPath);
  mkdirSync(dirname(target), { recursive: true });
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", io: "input" });
  writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`exported ${relPath}`);
}

for (const [topic, schema] of Object.entries(eventSchemas)) {
  write(join("events", `${topic}.schema.json`), schema);
}
for (const [name, schema] of Object.entries(projectionSchemas)) {
  write(join("projections", `${name}.schema.json`), schema);
}
