"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ledgerEntryViewSchema,
  paginatedSchema,
  positionsResponseSchema,
} from "@mogwai/shared";
import type { z } from "zod";

import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorNote } from "@/components/ui";

type Positions = z.infer<typeof positionsResponseSchema>;
type LedgerEntry = z.infer<typeof ledgerEntryViewSchema>;

const ACCOUNT_LABEL: Record<string, string> = {
  service_fee: "服务费",
  pledge: "担保",
  debt: "债务",
};

export default function BillingPage() {
  const [positions, setPositions] = useState<Positions | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const loadPage = useCallback(async (after?: string) => {
    setBusy(true);
    try {
      const page = await api(
        `/api/v1/billing/ledger?limit=20${after ? `&cursor=${after}` : ""}`,
        paginatedSchema(ledgerEntryViewSchema),
      );
      setEntries((prev) => (after ? [...prev, ...page.items] : page.items));
      setCursor(page.next_cursor);
      setHasLoaded(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    api("/api/v1/billing/positions", positionsResponseSchema)
      .then(setPositions)
      .catch(setError);
    void loadPage();
  }, [loadPage]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">账单</h1>
        <p className="mt-1 text-sm text-muted">
          纯记账制:CP 是记账单位,不是托管货币。每笔分录都固化当时的公式版本与变量快照,可逐笔追溯重算。
        </p>
      </div>
      <ErrorNote error={error} />

      <div className="grid grid-cols-4 gap-4">
        {(["service_fee", "debt", "pledge"] as const).map((account) => (
          <Card key={account} title={`${ACCOUNT_LABEL[account]}净头寸`}>
            <p className="font-mono text-xl font-semibold">
              {positions ? positions.positions[account].toLocaleString() : "—"}
            </p>
          </Card>
        ))}
        <Card title="可用担保额度">
          <p className="font-mono text-xl font-semibold">
            {positions ? positions.pledge_available_cp.toLocaleString() : "—"}
          </p>
        </Card>
      </div>

      <Card title="分录流水">
        {!hasLoaded ? (
          <Empty>加载中…</Empty>
        ) : entries.length === 0 ? (
          <Empty>还没有分录——接入并发起第一次调用后,这里会出现服务费记账。</Empty>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="pb-2 font-medium">时间</th>
                  <th className="pb-2 font-medium">科目</th>
                  <th className="pb-2 font-medium">事由</th>
                  <th className="pb-2 text-right font-medium">CP 变动</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <FragmentRow
                    key={entry.id}
                    entry={entry}
                    expanded={expanded === entry.id}
                    onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  />
                ))}
              </tbody>
            </table>
            {cursor && (
              <div className="mt-4 text-center">
                <Button variant="ghost" disabled={busy} onClick={() => void loadPage(cursor)}>
                  {busy ? "加载中…" : "加载更多"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function FragmentRow(props: { entry: LedgerEntry; expanded: boolean; onToggle: () => void }) {
  const { entry } = props;
  return (
    <>
      <tr className="border-b border-border/50 last:border-0">
        <td className="py-2.5 text-muted">{new Date(entry.created_at).toLocaleString("zh-CN")}</td>
        <td className="py-2.5">{ACCOUNT_LABEL[entry.account] ?? entry.account}</td>
        <td className="py-2.5 font-mono text-xs text-muted">{entry.reason}</td>
        <td
          className={`py-2.5 text-right font-mono ${
            entry.delta_cp < 0 ? "text-danger" : "text-ok"
          }`}
        >
          {entry.delta_cp > 0 ? "+" : ""}
          {entry.delta_cp.toLocaleString()}
        </td>
        <td className="py-2.5 pl-3 text-right">
          <button type="button" className="text-xs text-accent hover:underline" onClick={props.onToggle}>
            {props.expanded ? "收起" : "追溯"}
          </button>
        </td>
      </tr>
      {props.expanded && (
        <tr>
          <td colSpan={5} className="pb-3">
            <div className="rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed">
              <p className="text-muted">
                公式版本 {entry.formula_version ?? "—"} · txn {entry.txn_id} · 引用{" "}
                {entry.ref_type ?? "—"}:{entry.ref_id ?? "—"}
              </p>
              <pre className="mt-2 overflow-x-auto text-ink">
                {JSON.stringify(entry.snapshot, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
