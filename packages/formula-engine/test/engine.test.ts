import { describe, expect, it } from "vitest";

import { evaluateCredit, FormulaError } from "../src/index.js";

const run = (expr: string, vars: Record<string, number> = {}) =>
  evaluateCredit(expr, vars).creditCost;

describe("formula-engine", () => {
  it("四则运算与优先级", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("10 / 4")).toBe(2.5);
    expect(run("10 % 3")).toBe(1);
    expect(run("-3 + 5")).toBe(2);
    expect(run("2e3 * 1.5")).toBe(3000);
  });

  it("比较与逻辑(1/0 语义)", () => {
    expect(run("3 > 2")).toBe(1);
    expect(run("3 <= 2")).toBe(0);
    expect(run("1 && 0")).toBe(0);
    expect(run("1 || 0")).toBe(1);
    expect(run("!0")).toBe(1);
    expect(run("if(x > 100, 5, 1)", { x: 200 })).toBe(5);
  });

  it("白名单函数", () => {
    expect(run("ceil(1.01)")).toBe(2);
    expect(run("floor(1.99)")).toBe(1);
    expect(run("round(1.5)")).toBe(2);
    expect(run("min(3, 1, 2)")).toBe(1);
    expect(run("max(3, 1, 2)")).toBe(3);
    expect(run("clamp(5, 0, 3)")).toBe(3);
  });

  it("带点变量名(price.input)", () => {
    expect(run("tokens / 1e6 * price.input", { tokens: 2_000_000, "price.input": 3 })).toBe(6);
  });

  it("tech-design §3.3 默认公式:1M input + 0.5M output(gpt 类单价)", () => {
    const expression =
      "ceil((input_tokens / 1e6 * price.input + output_tokens / 1e6 * price.output + cached_tokens / 1e6 * price.cached) * fx_rate * margin * tier_discount)";
    const { creditCost, trace } = evaluateCredit(expression, {
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      cached_tokens: 0,
      "price.input": 2.5,
      "price.output": 10,
      "price.cached": 0.25,
      fx_rate: 1000,
      margin: 0.05,
      tier_discount: 1,
    });
    // usd = 2.5 + 5 = 7.5;cp = ceil(7.5 * 1000 * 0.05) = 375
    expect(creditCost).toBe(375);
    expect(trace.result).toBe(375);
    expect(trace.variables.fx_rate).toBe(1000);
  });

  it("未知变量/函数一律抛错,不默认 0", () => {
    expect(() => run("a + 1", {})).toThrow(FormulaError);
    expect(() => run("evil(1)")).toThrow(/unknown function/);
    expect(() => run("ceil(1, 2)")).toThrow(/expects 1 args/);
  });

  it("非法输入与非有限结果抛错", () => {
    expect(() => run("1 +")).toThrow(FormulaError);
    expect(() => run("1 ; 2")).toThrow(FormulaError);
    expect(() => run("1 / 0")).toThrow(/non-finite/);
    expect(() => run("x", { x: Number.NaN })).toThrow(/finite/);
  });

  it("确定性:同输入同结果", () => {
    const vars = { a: 3, b: 7 };
    expect(run("a * b + min(a, b)", vars)).toBe(run("a * b + min(a, b)", vars));
  });
});
