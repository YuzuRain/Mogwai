"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signIn, signUp } from "@/lib/auth";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signUp(email, password, name || email.split("@")[0] || "trainer");
      } else {
        await signIn(email, password);
      }
      router.replace("/console");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Mogwai</h1>
          <p className="mt-1 text-sm text-muted">AI 用量,养成你的怪兽</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-6">
          <div className="flex rounded-lg border border-border p-1 text-sm">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-1.5 transition ${
                  mode === m ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
                }`}
              >
                {m === "signin" ? "登录" : "注册"}
              </button>
            ))}
          </div>
          {mode === "signup" && (
            <Field label="昵称">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="训练师昵称(可选)"
              />
            </Field>
          )}
          <Field label="邮箱">
            <input
              className={inputClass}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="密码" hint={mode === "signup" ? "至少 8 位" : undefined}>
            <input
              className={inputClass}
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <ErrorNote error={error} />
          <Button type="submit" disabled={busy}>
            {busy ? "处理中…" : mode === "signin" ? "登录" : "创建账号"}
          </Button>
        </form>
      </div>
    </main>
  );
}
