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

## 架构总览

> 源图与详细说明见 [docs/architecture.md](docs/architecture.md) A1;改动时两处一起更新。

```mermaid
flowchart TB
    subgraph clients [接入层]
      APP[用户应用 / IDE / Agent<br/><i>任意 OpenAI 兼容 SDK</i>]
      WEB[控制台 + 对战 H5<br/><b>Next.js</b> App Router]
      TSDK[行为采集<br/><b>tracking-sdk(自研薄 SDK)</b>]
    end

    subgraph edge [网关层 · 独立部署 · 可替换运行时]
      GW[LLM Gateway<br/><b>LiteLLM Proxy(自托管)</b><br/>+ mogwai 插件 ×3:<br/>platform_auth / key_resolver / usage_publisher]
    end

    subgraph app [应用层 · core-app<br/><b>NestJS 模块化单体</b>(API + Worker 两种入口)]
      ACC[account<br/>用户/认证/Key 托管]
      BILL[billing<br/>公式引擎 + 复式账本]
      TELE[telemetry<br/>事件入库/关联]
      GAME[game<br/>EV/EXP/抽卡/日报]
      MATCH[match<br/>Glicko-2 匹配]
      BATTLE[battle<br/>模拟/复盘/结算]
      RT[realtime<br/><b>Socket.IO</b> 推送]
      ADMIN[admin<br/>配置中心/后台]
    end

    subgraph data [数据与基础设施层]
      RD[(<b>Redis 7</b><br/>Streams 事件总线<br/>+ 匹配队列 + 缓存)]
      PG[(<b>PostgreSQL 16</b><br/>业务 + 账本<br/>ORM: drizzle)]
      CH[(<b>ClickHouse</b><br/>行为事件 + EV 特征<br/>与 Langfuse 共用实例)]
      LF[<b>Langfuse v3 自托管</b><br/>LLM trace / prompt 观测]
      KMS[<b>云 KMS / OpenBao Transit</b><br/>Provider Key 信封加密]
    end

    APP -->|/v1/chat/completions| GW
    WEB -->|REST| app
    RT -.->|Socket.IO 推送| WEB
    TSDK -->|behavior.tracked| TELE
    GW -->|读三投影:token / Key / 授权| RD
    GW -->|usage.completed| RD
    GW -->|trace(内置 callback)| LF
    GW -->|解密 DEK| KMS
    RD -->|领域事件(消费组互相独立)| app
    app --> PG
    app --> CH
    ACC --> KMS
```

## 关键架构决策

- **模块化单体 + 独立网关**:核心应用为 NestJS 模块化单体;LLM 网关采用自托管 LiteLLM Proxy 加三个自研薄插件(platform_auth 鉴权、key_resolver Key 路由与债务清偿、usage_publisher 用量事件发布),定义为可替换运行时。网关只依赖 Redis 投影与 KMS,不触业务库;与应用层通过 Redis Streams 事件总线解耦,游戏域故障不影响 AI 代理主链路。
- **计费权威在应用侧**:网关只发布 usage 事件,权威账本(复式记账)由应用侧 ledger 模块维护,每日与网关日志对账。
- **合约化执行**:计费、抽卡、对战等有经济后果的执行,在发起时刻绑定不可变的规则版本与参数快照,保证可审计、可重放。
- **确定性战斗引擎**:纯函数实现(`packages/battle-core`),同一种子必得同一结果,前后端同构,天然支持回放与复盘。
- **数值体系复用宝可梦公式**:种族值 / 个体值 / 努力值 / 经验组 / 伤害公式,平衡性有成熟参照。

## 开发

```bash
# 依赖:Node ≥ 22、pnpm、docker(本机可用 colima)
pnpm install
pnpm test                              # 契约测试(packages/shared)
docker-compose -f infra/docker-compose.yml up -d   # Postgres 16 / Redis 7 / ClickHouse
pnpm export:schemas                    # zod → JSON Schema(gateway Python 侧校验用)
gateway/tests/run.sh                   # 网关集成测试(一键起真实依赖 + pytest)
pnpm --filter @mogwai/core-app db:migrate   # 数据库迁移(infra/migrations,drizzle-kit)
pnpm --filter @mogwai/core-app db:seed      # 配置中心初始参数(credit_formula v1 + price_table v1)
pnpm --filter @mogwai/core-app dev          # core-app(NestJS,:3000;管理面 API 见 architecture B4.1)
pnpm --filter @mogwai/core-app worker       # core-worker(billing 消费者:usage.completed → 账本)
pnpm --filter @mogwai/web dev               # web 控制台(Next.js,:3100;/api 反代到 core-app)
```

core-app 主要环境变量(均有本地默认值):`DATABASE_URL`、`MOGWAI_REDIS_URL`、
`MOGWAI_KMS_BACKEND`/`MOGWAI_DEV_KEK`(与 gateway 同一把,infra compose 注释)、
`BETTER_AUTH_SECRET`(生产必填)、`MOGWAI_WEB_ORIGIN`(web 部署源,better-auth CSRF 信任)。
web 环境变量:`CORE_APP_URL`(反代目标)、`NEXT_PUBLIC_GATEWAY_URL`(接入指南里的网关地址)。

事件与投影的权威契约在 `packages/shared`(zod);变更契约必须重新导出 JSON Schema 并同步设计文档(architecture A5)。LLM 网关(LiteLLM + 三插件)的设计与运行说明见 [gateway/README.md](gateway/README.md)。

## 预览产品文档

```bash
open docs/product.html
# 或
python3 -m http.server -d docs 8000   # http://localhost:8000/product.html
```
