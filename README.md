# Mogwai

模型聚合网关与游戏化激励系统。用户将各家大模型的 API Key 托管至平台,通过统一的 OpenAI 兼容网关调用;调用成本按可配置公式折算为 Credit Point(CP,纯记账单位,平台不托管资产)。AI 使用行为映射为魔怪的努力值与经验值,驱动升级、抽卡与对战;对战结算采用债务记账制——败方以其托管 Key 为胜方承担等值 token 消耗,平台仅记账,不参与分成。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/product.html](docs/product.html) | 产品设计:核心循环、玩法机制、功能地图、非目标 |
| [docs/tech-design.md](docs/tech-design.md) | 技术设计:CP 折算公式引擎、数据采集、EV 映射、EXP 与抽卡、匹配、战斗、结算 |
| [docs/architecture.md](docs/architecture.md) | 架构设计:组件选型、服务拓扑、Monorepo 结构、数据模型、事件契约、实施路线 |
| [docs/REVIEW.md](docs/REVIEW.md) | 设计评审:分块方案摘要与待裁定项 |
| [journal/WORKLOG.md](journal/WORKLOG.md) | 工作日志(append-only) |
| [journal/TODO.md](journal/TODO.md) | 集中待办 |

## 核心循环

```
托管 Key → 统一网关调用模型(CP 记账,公式可配置、版本化)
        → 采集 token / prompt / 行为数据(Langfuse)
        → 使用风格映射努力值;token 消耗累积 EXP
        → 升级触发技能抽卡(概率表版本化)
        → 质押 CP 担保额度,进入匹配对战(Glicko-2)
        → 败方背负 CP 债务,后续由胜方调用路由至败方 Key 实物清偿
        → 回到日常调用
```

## 关键架构决策

- **模块化单体 + 独立网关**:核心应用为 NestJS 模块化单体;LLM 网关采用自托管 LiteLLM Proxy 加三个自研插件(鉴权投影、usage 事件发布、隐私回调),定义为可替换运行时。网关与游戏域通过 Redis Streams 事件总线解耦,游戏域故障不影响 AI 代理主链路。
- **计费权威在应用侧**:网关只发布 usage 事件,权威账本(复式记账)由应用侧 ledger 模块维护,每日与网关日志对账。
- **合约化执行**:计费、抽卡、对战等有经济后果的执行,在发起时刻绑定不可变的规则版本与参数快照,保证可审计、可重放。
- **确定性战斗引擎**:纯函数实现(`packages/battle-core`),同一种子必得同一结果,前后端同构,天然支持回放与复盘。
- **数值体系复用宝可梦公式**:种族值 / 个体值 / 努力值 / 经验组 / 伤害公式,平衡性有成熟参照。

## 预览产品文档

```bash
open docs/product.html
# 或
python3 -m http.server -d docs 8000   # http://localhost:8000/product.html
```
