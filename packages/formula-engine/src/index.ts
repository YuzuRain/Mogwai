/**
 * 折算公式 DSL 求值沙箱(tech-design §3.3,architecture B4 契约)。
 *
 * 自实现的极小表达式引擎,零依赖、无任意代码执行面:
 * - 算术 + - * / %、比较、&& || !(布尔以 1/0 表示)、括号;
 * - 白名单函数:ceil / floor / round / min / max / clamp / if;
 * - 变量名允许带点(price.input);**未知变量/函数一律抛错**,绝不默认 0
 *   (静默缺变量会把账算错,fail loudly);
 * - 结果必须是有限数,否则抛错(除零等)。
 *
 * billing 消费与 admin 沙箱回放共用;同一 (expression, vars) 永远得到同一结果。
 */

export class FormulaError extends Error {
  constructor(message: string) {
    super(`formula: ${message}`);
  }
}

// -- 词法 --------------------------------------------------------------------

type Token =
  | { kind: "num"; value: number }
  | { kind: "ident"; name: string }
  | { kind: "op"; op: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

const TWO_CHAR_OPS = ["<=", ">=", "==", "!=", "&&", "||"];
const ONE_CHAR_OPS = ["+", "-", "*", "/", "%", "<", ">", "!"];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i++;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      tokens.push({ kind: "op", op: two });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.includes(ch)) {
      tokens.push({ kind: "op", op: ch });
      i++;
      continue;
    }
    // 数字字面量(含小数与 1e6 科学计数)
    const numMatch = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
    if (numMatch) {
      tokens.push({ kind: "num", value: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    // 标识符:字母开头,允许字母数字下划线与点(price.input)
    const identMatch = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i));
    if (identMatch) {
      tokens.push({ kind: "ident", name: identMatch[0] });
      i += identMatch[0].length;
      continue;
    }
    throw new FormulaError(`unexpected character '${ch}' at position ${i}`);
  }
  return tokens;
}

// -- 语法(Pratt)--------------------------------------------------------------

type Ast =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "unary"; op: string; operand: Ast }
  | { kind: "binary"; op: string; left: Ast; right: Ast }
  | { kind: "call"; name: string; args: Ast[] };

const BINDING_POWER: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Ast {
    const ast = this.expression(0);
    if (this.pos < this.tokens.length) {
      throw new FormulaError(`unexpected trailing token #${this.pos}`);
    }
    return ast;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private expression(minBp: number): Ast {
    let left = this.primary();
    for (;;) {
      const tok = this.peek();
      if (tok?.kind !== "op") break;
      const bp = BINDING_POWER[tok.op];
      if (bp === undefined || bp < minBp) break;
      this.pos++;
      left = { kind: "binary", op: tok.op, left, right: this.expression(bp + 1) };
    }
    return left;
  }

  private primary(): Ast {
    const tok = this.tokens[this.pos];
    if (!tok) throw new FormulaError("unexpected end of expression");
    this.pos++;
    if (tok.kind === "num") return { kind: "num", value: tok.value };
    if (tok.kind === "op" && (tok.op === "-" || tok.op === "!")) {
      return { kind: "unary", op: tok.op, operand: this.primary() };
    }
    if (tok.kind === "lparen") {
      const inner = this.expression(0);
      this.expect("rparen");
      return inner;
    }
    if (tok.kind === "ident") {
      if (this.peek()?.kind === "lparen") {
        this.pos++;
        const args: Ast[] = [];
        if (this.peek()?.kind !== "rparen") {
          for (;;) {
            args.push(this.expression(0));
            if (this.peek()?.kind === "comma") {
              this.pos++;
              continue;
            }
            break;
          }
        }
        this.expect("rparen");
        return { kind: "call", name: tok.name, args };
      }
      return { kind: "var", name: tok.name };
    }
    throw new FormulaError(`unexpected token #${this.pos - 1}`);
  }

  private expect(kind: Token["kind"]): void {
    if (this.tokens[this.pos]?.kind !== kind) {
      throw new FormulaError(`expected ${kind} at token #${this.pos}`);
    }
    this.pos++;
  }
}

// -- 求值 --------------------------------------------------------------------

function checkArity(name: string, args: number[], n: number): void {
  if (args.length !== n) {
    throw new FormulaError(`${name}() expects ${n} args, got ${args.length}`);
  }
}

function callFn(name: string, args: number[]): number {
  switch (name) {
    case "ceil":
      checkArity(name, args, 1);
      return Math.ceil(args[0]!);
    case "floor":
      checkArity(name, args, 1);
      return Math.floor(args[0]!);
    case "round":
      checkArity(name, args, 1);
      return Math.round(args[0]!);
    case "min":
      if (args.length === 0) throw new FormulaError("min() expects at least 1 arg");
      return Math.min(...args);
    case "max":
      if (args.length === 0) throw new FormulaError("max() expects at least 1 arg");
      return Math.max(...args);
    case "clamp":
      checkArity(name, args, 3);
      return Math.min(Math.max(args[0]!, args[1]!), args[2]!);
    case "if":
      checkArity(name, args, 3);
      return args[0] !== 0 ? args[1]! : args[2]!;
    default:
      throw new FormulaError(`unknown function '${name}'`);
  }
}

function evalAst(ast: Ast, vars: Record<string, number>): number {
  switch (ast.kind) {
    case "num":
      return ast.value;
    case "var": {
      const value = vars[ast.name];
      if (value === undefined) throw new FormulaError(`unknown variable '${ast.name}'`);
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new FormulaError(`variable '${ast.name}' is not a finite number`);
      }
      return value;
    }
    case "unary": {
      const v = evalAst(ast.operand, vars);
      return ast.op === "-" ? -v : v === 0 ? 1 : 0;
    }
    case "binary": {
      const l = evalAst(ast.left, vars);
      const r = evalAst(ast.right, vars);
      switch (ast.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return l / r;
        case "%": return l % r;
        case "<": return l < r ? 1 : 0;
        case "<=": return l <= r ? 1 : 0;
        case ">": return l > r ? 1 : 0;
        case ">=": return l >= r ? 1 : 0;
        case "==": return l === r ? 1 : 0;
        case "!=": return l !== r ? 1 : 0;
        case "&&": return l !== 0 && r !== 0 ? 1 : 0;
        case "||": return l !== 0 || r !== 0 ? 1 : 0;
        default: throw new FormulaError(`unknown operator '${ast.op}'`);
      }
    }
    case "call":
      return callFn(ast.name, ast.args.map((a) => evalAst(a, vars)));
  }
}

// -- 公开 API(architecture B4)---------------------------------------------------

export interface EvalTrace {
  expression: string;
  variables: Record<string, number>;
  result: number;
}

export function evaluateCredit(
  expression: string,
  vars: Record<string, number>,
): { creditCost: number; trace: EvalTrace } {
  const result = evalAst(new Parser(tokenize(expression)).parse(), vars);
  if (!Number.isFinite(result)) {
    throw new FormulaError(`expression produced non-finite result (${result})`);
  }
  return { creditCost: result, trace: { expression, variables: vars, result } };
}
