"use client";

import { useState } from "react";

import { profileSchema } from "@mogwai/shared";

import { api } from "@/lib/api";
import { Button, Card, ErrorNote } from "@/components/ui";
import { useProfile } from "../profile-context";

export default function SettingsPage() {
  const { profile, reload } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function togglePrivacy() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/account/profile", profileSchema, {
        method: "PATCH",
        body: JSON.stringify({ privacy_mode: !profile.privacy_mode }),
      });
      await reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">设置</h1>
      <ErrorNote error={error} />

      <Card title="账号">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">邮箱</dt>
            <dd>{profile.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">用户 ID</dt>
            <dd className="font-mono text-xs">{profile.user_id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">等级层</dt>
            <dd>{profile.tier}</dd>
          </div>
        </dl>
      </Card>

      <Card
        title="隐私模式"
        actions={
          <Button variant={profile.privacy_mode ? "ghost" : "primary"} disabled={busy} onClick={togglePrivacy}>
            {busy ? "切换中…" : profile.privacy_mode ? "已开启,点击关闭" : "已关闭,点击开启"}
          </Button>
        }
      >
        <p className="text-sm text-muted">
          开启后,prompt 明文<strong className="text-ink">不出网关</strong>,只保留脱敏摘要与统计特征;
          数值成长(EV/EXP)只依赖统计特征,游戏体验不受影响。切换即刻同步到所有平台 token。
        </p>
      </Card>
    </div>
  );
}
