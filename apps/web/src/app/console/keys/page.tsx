"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { paginatedSchema, providerKeySchema, PROVIDERS } from "@mogwai/shared";
import type { z } from "zod";

import { api, apiVoid } from "@/lib/api";
import { Badge, Button, Card, Empty, ErrorNote, Field, inputClass } from "@/components/ui";

type ProviderKey = z.infer<typeof providerKeySchema>;

const STATUS_TONE: Record<ProviderKey["status"], "ok" | "warn" | "danger" | "muted"> = {
  active: "ok",
  pending_verify: "warn",
  throttled: "warn",
  invalid: "danger",
  revoked: "muted",
};

const STATUS_LABEL: Record<ProviderKey["status"], string> = {
  active: "已激活",
  pending_verify: "校验中",
  throttled: "被限流",
  invalid: "无效",
  revoked: "已吊销",
};

export default function KeysPage() {
  const [keys, setKeys] = useState<ProviderKey[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("openai");
  const [key, setKey] = useState("");
  const [whitelist, setWhitelist] = useState("");
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const page = await api("/api/v1/account/keys", paginatedSchema(providerKeySchema));
    setKeys(page.items);
    // 录入即异步探测(tech-design §2.1):有 pending 就短轮询到终态
    if (page.items.some((k) => k.status === "pending_verify")) {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(() => void reload().catch(setError), 1500);
    }
  }, []);

  useEffect(() => {
    void reload().catch(setError);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [reload]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/account/keys", providerKeySchema, {
        method: "POST",
        body: JSON.stringify({
          provider,
          key: key.trim(),
          model_whitelist: whitelist
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setKey("");
      setWhitelist("");
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await apiVoid(`/api/v1/account/keys/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">Key 托管</h1>
        <p className="mt-1 text-sm text-muted">
          你的 provider Key 信封加密存储(明文不落库),录入后自动向 provider 探测校验;
          调用走你自己的 Key(BYOK),平台只按折算成本记 5% 服务费。
        </p>
      </div>
      <ErrorNote error={error} />

      <Card title="托管新 Key">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Provider">
              <select
                className={inputClass}
                value={provider}
                onChange={(e) => setProvider(e.target.value as (typeof PROVIDERS)[number])}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="模型白名单(可选,逗号分隔;留空 = 全模型)">
              <input
                className={inputClass}
                value={whitelist}
                onChange={(e) => setWhitelist(e.target.value)}
                placeholder="gpt-5, gpt-5-mini"
              />
            </Field>
          </div>
          <Field label="API Key(仅本次请求传输,服务端即刻加密)">
            <input
              className={inputClass}
              type="password"
              required
              minLength={8}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-…"
            />
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? "提交中…" : "托管并校验"}
          </Button>
        </form>
      </Card>

      <Card title="已托管">
        {keys === null ? (
          <Empty>加载中…</Empty>
        ) : keys.length === 0 ? (
          <Empty>还没有托管 Key。</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="pb-2 font-medium">Provider</th>
                <th className="pb-2 font-medium">状态</th>
                <th className="pb-2 font-medium">白名单</th>
                <th className="pb-2 font-medium">托管时间</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.key_id} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 font-mono">{k.provider}</td>
                  <td className="py-2.5">
                    <Badge tone={STATUS_TONE[k.status]}>{STATUS_LABEL[k.status]}</Badge>
                  </td>
                  <td className="py-2.5 font-mono text-xs text-muted">
                    {k.model_whitelist.length === 0 ? "全模型" : k.model_whitelist.join(", ")}
                  </td>
                  <td className="py-2.5 text-muted">
                    {new Date(k.created_at).toLocaleDateString("zh-CN")}
                  </td>
                  <td className="py-2.5 text-right">
                    <Button variant="danger" onClick={() => revoke(k.key_id)}>
                      吊销
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
