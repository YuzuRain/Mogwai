import { describe, expect, it } from "vitest";

import { buildAllGuides, buildGuide, TOKEN_PLACEHOLDER, TOOL_IDS } from "./snippets";

const GW = "http://localhost:4000";
const TOKEN = "mgw_test_token_abc";

describe("接入指南片段", () => {
  it("五个工具全部有指南,token 与网关地址被注入", () => {
    const guides = buildAllGuides(GW, TOKEN);
    expect(guides.map((g) => g.id)).toEqual([...TOOL_IDS]);
    for (const guide of guides) {
      const all = guide.snippets.map((s) => s.code).join("\n");
      expect(all).toContain(TOKEN);
      expect(all).toContain("localhost:4000");
    }
  });

  it("Claude Code 的 base URL 不带 /v1(Anthropic wire format)", () => {
    const code = buildGuide("claude-code", GW, TOKEN).snippets[0]!.code;
    expect(code).toContain(`ANTHROPIC_BASE_URL="${GW}"`);
    expect(code).not.toContain("/v1");
    // 模型名必须带 provider/ 前缀(网关裸模型名 400)
    expect(code).toContain("anthropic/");
  });

  it("OpenAI 兼容工具的 base URL 带 /v1", () => {
    for (const id of ["codex-cli", "cline", "cursor", "trae"] as const) {
      const all = buildGuide(id, GW, TOKEN)
        .snippets.map((s) => s.code)
        .join("\n");
      expect(all).toContain(`${GW}/v1`);
    }
  });

  it("网关地址尾部斜杠被规整,空 token 用占位符", () => {
    const code = buildGuide("cline", "http://gw.example.com///", TOKEN).snippets[0]!.code;
    expect(code).toContain("http://gw.example.com/v1");
    const guides = buildAllGuides(GW, "");
    expect(guides[0]!.snippets[0]!.code).toContain(TOKEN_PLACEHOLDER);
  });
});
