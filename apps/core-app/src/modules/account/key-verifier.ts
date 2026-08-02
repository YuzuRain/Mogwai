import { Logger } from "@nestjs/common";
import type { Provider } from "@mogwai/shared";

/**
 * Key 录入探测(tech-design §2.1「录入即校验」):调 provider 低成本端点验证有效性。
 * 判定只看鉴权语义:2xx → ok;401/403 → unauthorized(Key 无效);
 * 其余(网络错误/5xx/限流)→ unreachable,状态停留 pending_verify,由启动扫描重试,
 * 绝不把「探测基建故障」误判成「Key 无效」。
 *
 * 测试通过 MOGWAI_PROBE_BASE_URL_<PROVIDER> 指向具名测试替身(付费外部 API,
 * no-mocks 规则允许的唯一例外);生产不设置即用真实端点。
 */

const logger = new Logger("KeyVerifier");

interface ProbeSpec {
  defaultBase: string;
  path: string;
  headers: (key: string) => Record<string, string>;
}

const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

const PROBES: Record<Provider, ProbeSpec> = {
  openai: { defaultBase: "https://api.openai.com/v1", path: "/models", headers: bearer },
  anthropic: {
    defaultBase: "https://api.anthropic.com/v1",
    path: "/models",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  deepseek: { defaultBase: "https://api.deepseek.com/v1", path: "/models", headers: bearer },
  qwen: {
    defaultBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    path: "/models",
    headers: bearer,
  },
  volcengine: {
    defaultBase: "https://ark.cn-beijing.volces.com/api/v3",
    path: "/models",
    headers: bearer,
  },
};

export type ProbeResult = "ok" | "unauthorized" | "unreachable";

export async function probeProviderKey(provider: Provider, plaintextKey: string): Promise<ProbeResult> {
  const spec = PROBES[provider];
  const base = process.env[`MOGWAI_PROBE_BASE_URL_${provider.toUpperCase()}`] ?? spec.defaultBase;
  try {
    const resp = await fetch(`${base}${spec.path}`, {
      headers: spec.headers(plaintextKey),
      signal: AbortSignal.timeout(10_000),
    });
    if (resp.ok) return "ok";
    if (resp.status === 401 || resp.status === 403) return "unauthorized";
    logger.error(`probe ${provider}: unexpected status ${resp.status}, keeping pending_verify`);
    return "unreachable";
  } catch (err) {
    logger.error(`probe ${provider}: ${err instanceof Error ? err.message : String(err)}`);
    return "unreachable";
  }
}
