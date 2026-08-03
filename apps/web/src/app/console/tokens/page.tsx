"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createTokenResponseSchema,
  paginatedSchema,
  platformTokenSchema,
} from "@mogwai/shared";
import type { z } from "zod";

import { api, apiVoid } from "@/lib/api";
import { Button, Card, CodeBlock, Empty, ErrorNote } from "@/components/ui";

type PlatformToken = z.infer<typeof platformTokenSchema>;
type Issued = z.infer<typeof createTokenResponseSchema>;

export default function TokensPage() {
  const [tokens, setTokens] = useState<PlatformToken[] | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const page = await api("/api/v1/account/tokens", paginatedSchema(platformTokenSchema));
      setTokens(page.items);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      setIssued(await api("/api/v1/account/tokens", createTokenResponseSchema, { method: "POST" }));
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
      await apiVoid(`/api/v1/account/tokens/${id}`, { method: "DELETE" });
      if (issued?.token_id === id) setIssued(null);
      await reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">平台 token</h1>
          <p className="mt-1 text-sm text-muted">
            coding agent 调网关用的凭证(<code className="font-mono">mgw_</code> 前缀)。吊销即刻生效。
          </p>
        </div>
        <Button onClick={issue} disabled={busy}>
          {busy ? "签发中…" : "签发新 token"}
        </Button>
      </div>
      <ErrorNote error={error} />

      {issued && (
        <Card title="新 token 已签发——明文只显示这一次,立即保存">
          <CodeBlock label="平台 token" code={issued.token} />
          <p className="mt-2 text-xs text-warn">
            关闭页面后无法再次查看;丢失只能吊销重发。可直接粘贴到「接入指南」页生成配置。
          </p>
        </Card>
      )}

      <Card title="已签发">
        {tokens === null ? (
          <Empty>加载中…</Empty>
        ) : tokens.length === 0 ? (
          <Empty>还没有 token,点右上角签发。</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="pb-2 font-medium">前缀</th>
                <th className="pb-2 font-medium">签发时间</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => (
                <tr key={token.token_id} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 font-mono">{token.token_prefix}…</td>
                  <td className="py-2.5 text-muted">
                    {new Date(token.created_at).toLocaleString("zh-CN")}
                  </td>
                  <td className="py-2.5 text-right">
                    <Button variant="danger" onClick={() => revoke(token.token_id)}>
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
