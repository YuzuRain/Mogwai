"use client";

import { useState, type ReactNode } from "react";

export function Card(props: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      {(props.title || props.actions) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-ink">{props.title}</h2>
          {props.actions}
        </header>
      )}
      {props.children}
    </section>
  );
}

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
}) {
  const variant = props.variant ?? "primary";
  const styles = {
    primary: "bg-accent text-white hover:opacity-90",
    ghost: "border border-border bg-transparent text-ink hover:bg-surface-2",
    danger: "border border-danger/40 bg-transparent text-danger hover:bg-danger/10",
  }[variant];
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {props.children}
    </button>
  );
}

export function Field(props: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{props.label}</span>
      {props.children}
      {props.hint && <span className="mt-1 block text-xs text-muted/70">{props.hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent";

export function Badge(props: { tone: "ok" | "warn" | "danger" | "muted"; children: ReactNode }) {
  const tone = {
    ok: "bg-ok/10 text-ok",
    warn: "bg-warn/10 text-warn",
    danger: "bg-danger/10 text-danger",
    muted: "bg-surface-2 text-muted",
  }[props.tone];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
      {props.children}
    </span>
  );
}

export function CodeBlock(props: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-[#0d1117]">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs text-muted">{props.label ?? ""}</span>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={async () => {
            await navigator.clipboard.writeText(props.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "已复制 ✓" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-ink">
        {props.code}
      </pre>
    </div>
  );
}

export function ErrorNote(props: { error: unknown }) {
  if (!props.error) return null;
  const message =
    props.error instanceof Error ? props.error.message : String(props.error);
  return (
    <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function Empty(props: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{props.children}</p>;
}
