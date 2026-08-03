"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  paginatedSchema,
  positionsResponseSchema,
  providerKeySchema,
  platformTokenSchema,
} from "@mogwai/shared";
import type { z } from "zod";

import { api } from "@/lib/api";
import { Card, Badge, ErrorNote } from "@/components/ui";
import { useProfile } from "./profile-context";

type Positions = z.infer<typeof positionsResponseSchema>;

export default function OverviewPage() {
  const { profile } = useProfile();
  const [positions, setPositions] = useState<Positions | null>(null);
  const [keyCount, setKeyCount] = useState<number | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([
      api("/api/v1/billing/positions", positionsResponseSchema),
      api("/api/v1/account/keys", paginatedSchema(providerKeySchema)),
      api("/api/v1/account/tokens", paginatedSchema(platformTokenSchema)),
    ])
      .then(([pos, keys, tokens]) => {
        setPositions(pos);
        setKeyCount(keys.items.filter((k) => k.status === "active").length);
        setTokenCount(tokens.items.length);
      })
      .catch(setError);
  }, []);

  const steps = [
    { done: (keyCount ?? 0) > 0, label: "托管一把 provider Key", href: "/console/keys" },
    { done: (tokenCount ?? 0) > 0, label: "签发平台 token", href: "/console/tokens" },
    {
      done: positions !== null && positions.positions.service_fee !== 0,
      label: "在你的 coding agent 里发起第一次调用",
      href: "/console/setup",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">你好,{profile.email.split("@")[0]}</h1>
        <p className="mt-1 text-sm text-muted">
          Mogwai 把你的 AI 用量变成怪兽成长——先接入,用起来,数值自然长。
        </p>
      </div>
      <ErrorNote error={error} />

      <div className="grid grid-cols-3 gap-4">
        <Card title="服务费净头寸(CP)">
          <p className="font-mono text-2xl font-semibold">
            {positions ? positions.positions.service_fee.toLocaleString() : "—"}
          </p>
          <p className="mt-1 text-xs text-muted">负数 = 应付平台服务费(BYOK 5%)</p>
        </Card>
        <Card title="可用担保额度(CP)">
          <p className="font-mono text-2xl font-semibold">
            {positions ? positions.pledge_available_cp.toLocaleString() : "—"}
          </p>
          <p className="mt-1 text-xs text-muted">对战质押用,随 M4 开放</p>
        </Card>
        <Card title="活跃 Key / token">
          <p className="font-mono text-2xl font-semibold">
            {keyCount ?? "—"} / {tokenCount ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted">托管 Key · 平台 token</p>
        </Card>
      </div>

      <Card title="接入三步">
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <Badge tone={step.done ? "ok" : "muted"}>{step.done ? "✓" : i + 1}</Badge>
              <Link href={step.href} className={step.done ? "text-muted line-through" : "hover:text-accent"}>
                {step.label}
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
