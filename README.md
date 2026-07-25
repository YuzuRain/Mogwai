# DigMon · AI 训练师对战平台

把各家大模型的 API Key 托管到平台,统一折算为 Credit Point(纯记账单位,平台零托管);用 AI 的方式塑造你的数码兽努力值,token 消耗转化为经验值,升级抽技能,匹配对战——败方以自己托管的 Key 为胜方承担等值 token 消耗。

**一句话:模型聚合网关(类 OpenRouter)× 宝可梦式养成对战。**

## 文档索引

| 文档 | 内容 | 读者 |
|---|---|---|
| [docs/product.html](docs/product.html) | 产品文档(H5,浏览器直接打开,移动端适配) | 产品 / 运营 / 投资人 |
| [docs/tech-design.md](docs/tech-design.md) | 技术设计:CP 折算公式引擎、Langfuse 数据采集、EV 映射、EXP/抽卡、匹配/战斗/结算的完整方案与公式 | 研发 |
| [docs/architecture.md](docs/architecture.md) | 代码架构:服务拓扑、Monorepo 目录结构、数据模型、事件契约、实施路线 | 研发 |

## 核心循环

```
托管 Key → 统一网关调模型(CP 计价,公式可配置)
        → 采集 prompt / token / 行为数据(Langfuse)
        → 使用风格 → 努力值六维;token → EXP → 升级
        → 升级抽技能卡(池子 + 保底)
        → 质押 CP 匹配对战(Glicko-2)
        → 败方背负 CP 债务,以托管 Key 为胜方扛 token 清偿(平台只记账,不抽成)→ 回到调模型
```

## 关键技术决策(详见文档)

- **架构**:模块化单体(NestJS)+ 独立 LLM 网关(LiteLLM Proxy 自托管 + 3 个自研薄插件,运行时可替换),事件总线解耦——游戏域故障不影响 AI 代理主链路
- **折算公式**:安全表达式 DSL,版本化 + 灰度 + 沙箱回放,每笔账可审计重算
- **战斗引擎**:纯函数确定性模拟(`packages/battle-core`),同一种子必然同一结果,前后端同构、天然可回放
- **数值体系**:完整复用宝可梦公式(种族值/个体值/努力值/中速经验组/伤害公式),平衡性有成熟参照

## 预览产品 H5

```bash
open docs/product.html        # macOS 直接打开
# 或
python3 -m http.server -d docs 8000   # http://localhost:8000/product.html
```
