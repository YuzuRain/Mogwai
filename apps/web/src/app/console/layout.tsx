"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { profileSchema } from "@mogwai/shared";

import { api, ApiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { ProfileContext, type Profile } from "./profile-context";

const NAV = [
  { href: "/console", label: "概览" },
  { href: "/console/setup", label: "接入指南" },
  { href: "/console/tokens", label: "平台 token" },
  { href: "/console/keys", label: "Key 托管" },
  { href: "/console/billing", label: "账单" },
  { href: "/console/settings", label: "设置" },
];

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setProfile(await api("/api/v1/account/profile", profileSchema));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      // 会话有效但加载失败(core-app 不可达等):显式报错,不假装已登出
      setFailed(err instanceof Error ? err.message : String(err));
    }
  }, [router]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (failed) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-danger">控制台加载失败:{failed}</p>
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">加载中…</p>
      </main>
    );
  }

  return (
    <ProfileContext.Provider value={{ profile, reload }}>
      <div className="mx-auto flex min-h-screen max-w-6xl">
        <aside className="flex w-52 shrink-0 flex-col border-r border-border p-4">
          <Link href="/console" className="mb-6 px-2 text-lg font-bold tracking-tight">
            Mogwai
          </Link>
          <nav className="space-y-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm transition ${
                  pathname === item.href
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-border pt-4">
            <p className="truncate px-2 text-xs text-muted">{profile.email}</p>
            <button
              type="button"
              className="mt-2 px-2 text-xs text-muted hover:text-danger"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              退出登录
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-8">{children}</main>
      </div>
    </ProfileContext.Provider>
  );
}
