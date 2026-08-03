"use client";

import { useMemo, useState } from "react";

import { buildGuide, TOKEN_PLACEHOLDER, TOOL_IDS, type ToolId } from "@/lib/snippets";
import { Card, CodeBlock, Field, inputClass } from "@/components/ui";

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:4000";

const TOOL_LABELS: Record<ToolId, string> = {
  "claude-code": "Claude Code",
  "codex-cli": "Codex CLI",
  cline: "Cline",
  cursor: "Cursor",
  trae: "Trae",
};

export default function SetupPage() {
  const [tool, setTool] = useState<ToolId>("claude-code");
  const [token, setToken] = useState("");
  const guide = useMemo(
    () => buildGuide(tool, GATEWAY_URL, token.trim() || TOKEN_PLACEHOLDER),
    [tool, token],
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">接入指南</h1>
        <p className="mt-1 text-sm text-muted">
          选择你的工具,一行配置接入网关。模型名一律 <code className="font-mono">provider/model</code>
        (如 <code className="font-mono">anthropic/claude-sonnet-4-20250514</code>),裸模型名会被拒绝。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TOOL_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTool(id)}
            className={`rounded-lg border px-4 py-2 text-sm transition ${
              tool === id
                ? "border-accent bg-accent-soft text-accent"
                : "border-border text-muted hover:text-ink"
            }`}
          >
            {TOOL_LABELS[id]}
          </button>
        ))}
      </div>

      <Card>
        <Field
          label="平台 token(粘贴后自动填进片段;明文只在签发时展示,平台不回显)"
        >
          <input
            className={inputClass}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="mgw_…(在「平台 token」页签发)"
          />
        </Field>
      </Card>

      <Card title={guide.name}>
        <p className="mb-4 text-sm text-muted">{guide.note}</p>
        <div className="space-y-4">
          {guide.snippets.map((snippet) => (
            <CodeBlock key={snippet.label} label={snippet.label} code={snippet.code} />
          ))}
        </div>
      </Card>

      <Card title="验证">
        <p className="mb-3 text-sm text-muted">接入后发起任意一次调用,然后到「账单」页确认分录出现。也可以直接 curl:</p>
        <CodeBlock
          label="curl 冒烟"
          code={[
            `curl ${GATEWAY_URL}/v1/chat/completions \\`,
            `  -H "Authorization: Bearer ${token.trim() || TOKEN_PLACEHOLDER}" \\`,
            `  -H "Content-Type: application/json" \\`,
            `  -d '{"model":"openai/gpt-5","messages":[{"role":"user","content":"ping"}]}'`,
          ].join("\n")}
        />
      </Card>
    </div>
  );
}
