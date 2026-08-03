/**
 * 接入指南(tech-design §2.2:接入形态即转化面,控制台一等公民)。
 * 每工具「一行配置」片段的单一生成点:纯函数、可单测——这里出错等于用户接不进来。
 *
 * 两个硬约定:
 * - 模型名一律 `provider/model`(网关裸模型名直接 400);
 * - Claude Code 走 Anthropic wire format,base URL **不带** `/v1`;
 *   OpenAI 兼容客户端(Codex/Cline/Cursor/Trae)的 base URL **带** `/v1`。
 */

export const TOOL_IDS = ["claude-code", "codex-cli", "cline", "cursor", "trae"] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export interface Snippet {
  label: string;
  language: "bash" | "toml" | "text";
  code: string;
}

export interface ToolGuide {
  id: ToolId;
  name: string;
  note: string;
  snippets: Snippet[];
}

export const TOKEN_PLACEHOLDER = "<你的平台 token(控制台“平台 token”页签发)>";

export function buildGuide(tool: ToolId, gatewayUrl: string, token: string): ToolGuide {
  const base = gatewayUrl.replace(/\/+$/, "");
  const v1 = `${base}/v1`;
  switch (tool) {
    case "claude-code":
      return {
        id: tool,
        name: "Claude Code",
        note: "Anthropic wire format(/v1/messages),base URL 不带 /v1;模型名用 anthropic/ 前缀。",
        snippets: [
          {
            label: "shell(加入 ~/.zshrc 或 ~/.bashrc)",
            language: "bash",
            code: [
              `export ANTHROPIC_BASE_URL="${base}"`,
              `export ANTHROPIC_AUTH_TOKEN="${token}"`,
              `export ANTHROPIC_MODEL="anthropic/claude-sonnet-4-20250514"`,
              `claude`,
            ].join("\n"),
          },
        ],
      };
    case "codex-cli":
      return {
        id: tool,
        name: "Codex CLI",
        note: "OpenAI 兼容,~/.codex/config.toml 增加自定义 provider。",
        snippets: [
          {
            label: "~/.codex/config.toml",
            language: "toml",
            code: [
              `model = "openai/gpt-5"`,
              `model_provider = "mogwai"`,
              ``,
              `[model_providers.mogwai]`,
              `name = "Mogwai Gateway"`,
              `base_url = "${v1}"`,
              `env_key = "MOGWAI_API_KEY"`,
            ].join("\n"),
          },
          {
            label: "shell",
            language: "bash",
            code: `export MOGWAI_API_KEY="${token}"`,
          },
        ],
      };
    case "cline":
      return {
        id: tool,
        name: "Cline(VS Code)",
        note: "设置 → API Provider 选「OpenAI Compatible」,填入以下三项。",
        snippets: [
          {
            label: "Cline 设置项",
            language: "text",
            code: [
              `Base URL : ${v1}`,
              `API Key  : ${token}`,
              `Model ID : openai/gpt-5 (或任意 provider/model)`,
            ].join("\n"),
          },
        ],
      };
    case "cursor":
      return {
        id: tool,
        name: "Cursor",
        note: "Settings → Models → 启用「Override OpenAI Base URL」;模型列表添加自定义模型名。",
        snippets: [
          {
            label: "Cursor 设置项",
            language: "text",
            code: [
              `OpenAI Base URL : ${v1}`,
              `OpenAI API Key  : ${token}`,
              `自定义模型名     : openai/gpt-5 (或任意 provider/model)`,
            ].join("\n"),
          },
        ],
      };
    case "trae":
      return {
        id: tool,
        name: "Trae",
        note: "模型管理 → 添加自定义模型服务商(OpenAI 兼容)。",
        snippets: [
          {
            label: "Trae 设置项",
            language: "text",
            code: [
              `Base URL : ${v1}`,
              `API Key  : ${token}`,
              `模型名    : openai/gpt-5 (或任意 provider/model)`,
            ].join("\n"),
          },
        ],
      };
  }
}

export function buildAllGuides(gatewayUrl: string, token: string): ToolGuide[] {
  return TOOL_IDS.map((id) => buildGuide(id, gatewayUrl, token || TOKEN_PLACEHOLDER));
}
