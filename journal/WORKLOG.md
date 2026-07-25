# 工作日志(append-only)

> 规则见 `.cursor/rules/session-journal.mdc`:每次对工程有影响的会话,结束前追加一条记录。
> 待办事项统一记在同目录 [TODO.md](./TODO.md)。

---

## 2026-07-25 · 初始产品/技术/架构设计

**目的**: 从零梳理 DigMon(模型聚合网关 × 宝可梦式养成对战)的产品与技术设计
**改动**:
- 新建四份文档:`docs/product.html`(产品 H5)、`docs/tech-design.md`(技术设计)、`docs/architecture.md`(代码架构)、`README.md`
- 核心设定:CP 折算公式 DSL(三层配置+版本化)、EV 六维映射、token→EXP、升级抽卡、Glicko-2 匹配、确定性自动战斗
**引用**: commit e7b1d64

## 2026-07-25 · 分块评审文档

**目的**: 把全部设计拆成可逐块拍板的评审清单
**改动**:
- 新建 `docs/REVIEW.md`,12 个 Block,每块含方案摘要、预设默认值、待拍板问题
**引用**: docs/REVIEW.md

## 2026-07-25 · 产品文档重写为核心玩法版 + 黑白极简改版

**目的**: 纠偏——产品文档聚焦核心玩法与功能循环,砍掉商业化/排期章节;视觉改 OpenAI 风格黑白
**改动**:
- `docs/product.html` v0.2:主循环 + 三个嵌套子循环(分钟/天/周)、速攻手/重炮手养成分化示例、玩家旅程、功能地图、「刻意不做」清单
- 全站换极简黑白视觉,去 emoji、去彩色
**引用**: docs/product.html

## 2026-07-25 · 建仓推送 + 技术/架构文档对齐产品 v0.2

**目的**: 初始化 git 仓库推送远程;把产品新原则落到实现层
**改动**:
- 建仓并推送 git@github.com:YuzuRain/Ege.git(main)
- tech-design 新增:产品原则技术约束(§1.4)、实时反馈通道(§2.4)、EV 日报归因(§5.4)、复盘归因(§9.5)
- architecture 新增 realtime / game.report / battle.analysis 模块,路线图按「循环闭合」验收
**引用**: commits e7b1d64、914a4ef

## 2026-07-25 · 网关 buy-vs-build 与全组件选型

**目的**: Top-level 技术架构补齐组件选型与替换触发条件
**改动**:
- 网关选型 LiteLLM Proxy(自托管)+ 3 个自研薄插件,定义为可替换运行时;权威计费不交给 LiteLLM
- 全组件选型清单 27 项(better-auth、BullMQ、glicko2、OpenBao、Metabase 等),含替换触发条件;新增 A2「自研/复用判定原则」
- 匹配器评估 Open Match/Nakama/Colyseus 后决定自研(Redis ZSET)
**引用**: commit 5e94254 · docs/architecture.md Part A

## 2026-07-25 · Cursor 规则铁律

**目的**: 把用户的 7 条工程铁律固化为项目规则
**改动**:
- 新建 `.cursor/rules/`:core-principles / no-mocks / architecture-discipline / design-docs-first(全部 alwaysApply)
**引用**: commit ac5500f · .cursor/rules/

## 2026-07-25 · 架构评审修复 + 记账制结算重构

**目的**: 全量评审两份设计文档;落实用户裁定的纯记账制经济模型
**改动**:
- 评审修复 12 项:合约化原则(§1.5)、授权投影软预检、行为事件锚点核验(防刷 EV)、结算统一事件驱动、usage 事件 spool+每日对账、质押状态机、隐私在网关执行、平台 Key 池统一加密、排行榜归位 match 域等
- **结算模型重构(用户裁定,REVIEW Block 13)**:CP 为纯记账单位,平台零托管零抽成;入场券 = 托管 Key 担保额度(不赠送);败方债务由胜方调用路由到败方 Key 实物冲销(§10.3);幽灵局改练习赛;首发纯 BYOK
- 同步修订 product.html / README / REVIEW(Block 2/10 加裁定注记)
**引用**: commit ac5500f · docs/tech-design.md §1.5/§2.5/§3.5/§10 · docs/architecture.md A4/A5/B3/B5.2

## 2026-07-25 · 新增会话日志规则与 journal 目录

**目的**: 建立跨会话审计线索:操作日志 + 集中 TODO
**改动**:
- 新建 `.cursor/rules/session-journal.mdc`(alwaysApply)
- 新建 `journal/WORKLOG.md`(回填今日全部工作)、`journal/TODO.md`(归拢当前全部挂起事项)
**引用**: journal/ · .cursor/rules/session-journal.mdc

## 2026-07-25 · README 改写为专业冷静风格

**目的**: 去掉 README 的宣传腔,改为客观的工程仓库首页
**改动**:
- 重写 `README.md`:开头改为系统的客观描述;文档索引补全 REVIEW/journal;"关键技术决策"改为五条架构决策陈述(含计费权威、合约化执行);删除读者定位列与口号式表述
**引用**: README.md

## 2026-07-25 · REVIEW 全部 Block 逐条裁定并落文档

**目的**: 与用户逐条过 TODO/REVIEW,拿到全部 12 个未决 Block 的裁定并回写正式文档
**改动**:
- **产品改名 DigMon → Mogwai**,全仓改名(README / 三份 docs / architecture 插件与目录名),"数码兽"改"魔怪"
- 裁定落 tech-design(v0.2 → v0.3):新增 §1.4 #5「采集钉网关、客户端外壳可替换(未来可能纯 CLI addon)」;EV 取消周衰减改赛季重置(M5);IV 改窄幅随机(总和恒定 126、单项 13~29);等级曲线改中速偏慢组(前期加速);技能属性首发用宝可梦 18;loss_rate 30% → 20%;provider 加火山方舟(共 5 家)
- 裁定落 REVIEW.md:Block 1–12 结论全部回填,汇总表完成,13/13 有结论;明确原则「模块内数值设计不前置拍板」(Block 7/8/9 数值推到 M3/M4 模块设计时)
- 其他确认:1000 CP/USD + 服务费 5%;明文默认开(数据全量回流为核心诉求);技能池 40;TS 全栈(单人团队,按「只选对的」标准);不做 Demo 直接 M1;里程碑按范围验收不设周期
- product.html 同步(v0.2 → v0.3);journal/TODO.md 按模块重组,新增长线区(双人审批、数据回流专项、CLI addon、Bifrost 预案)
**引用**: docs/REVIEW.md 汇总表 · docs/tech-design.md §1.4/§5/§6/§7/§10 · docs/product.html · journal/TODO.md

## 2026-07-25 · 架构总览图评审修正并嵌入 README

**目的**: 开发分模块动工前,确认顶层架构图简洁清晰,并放到 README 作为仓库门面
**改动**:
- architecture.md A1 图修正三处:Redis→app 边的「消费组×4」改为「领域事件(消费组互相独立)」(原数字只对 usage.completed 成立);网关读 Redis 边点明「读三投影:token/Key/授权」;补 realtime -.-> Web 的 Socket.IO 推送边(即时反馈闭环原先在图上断裂)
- README 新增「架构总览」章节,嵌入与 A1 同源的 mermaid 图,两处互相标注「改动时一起更新」
- 修正过期命名:README 关键架构决策与 journal/TODO.md M1 gateway 项中的网关插件名统一为 platform_auth / key_resolver / usage_publisher(与 architecture A4 / tech-design §2.5 对齐;旧文本残留 auth_projection / 隐私回调)
**引用**: docs/architecture.md A1 · README.md · journal/TODO.md

## 2026-07-25 · Coding agent 用户可达性讨论,结论落文档

**目的**: 回答「用户都在 Claude Code/Cursor/Trae 里,网关路线还成立吗」,把结论固化
**改动**:
- **核心结论:路线成立,不推翻任何架构决策**。coding agent 均支持 base URL 覆盖,一行配置接入网关(OpenRouter 已验证);「采集钉网关」决策被验证而非动摇。市场边界明确为「按 token 付费的 coding agent 用户」,订阅制流量结构性不可达、定位为漏斗上游——结论落 tech-design §1.4 #5
- **数据面分级原则**(新增,tech-design §1.4 #5):网关 = 权威数据面(计费/正式 EV/结算只认它);客户端 addon 采集 = 低信任辅助面(自述可伪造,只进练习赛/展示)。依据:遥测喂的是有经济利益的竞技游戏,上报者是数据膨胀受益人,Langfuse 式自采上报的信任前提在本产品不成立
- tech-design §2.2:网关双协议为 M1 验收项——OpenAI 兼容 + Anthropic `/v1/messages`(Claude Code 接入硬需求);每工具接入指南定为控制台一等公民。architecture A1 铁律 #1 / A3 #1 同步
- tech-design §4.2:EV 特征以网关流量为主数据源(相邻高相似请求/会话节奏/工具调用模式/上下文长度),tracking-sdk 降级为控制台补充;architecture A3 #21 同步
- tech-design §10.3 新增 M4 两个已知设计输入:清偿路由的 provider 匹配缺口(债务滞留策略);清偿调用丢 prompt cache、受债务人 rate limit 的范围限定
- journal/TODO.md:M1 加 LiteLLM spike(验证三扩展点,最大风险前置)、双协议验收、接入指南页;M4 加清偿两输入;长线 CLI addon 项扩写为获客层框架(mogwai init / 练习赛数据面:Claude Code 本地 transcript、Cursor CSV 手动上传、Trae 待调研 / source=addon 信任权重 / 不早于 M5)
**引用**: docs/tech-design.md §1.4/§2.2/§4.2/§10.3 · docs/architecture.md A1/A3 · journal/TODO.md

## 2026-07-25 · LiteLLM spike:网关插件架构验证通过(M1 最大风险解除)

**目的**: 开发正式启动前,验证 A4 网关插件架构的三个扩展点在 LiteLLM 上真实可行
**改动**:
- 新建 `test/litellm-spike/`(一次性 spike,独立于 monorepo 布局):LiteLLM + Redis + fake_provider(付费 API 测试替身)+ seed + verify.sh,docker-compose 一键起
- **结论:LiteLLM 方案成立,6/6 断言通过**——custom_auth 读 token 投影认出 user_id 并拒绝未知 token(401);pre-call hook 读 Key 投影、AES-256-GCM 解密、注入请求,上游真实收到解密后的 Key(openai 与 anthropic 双 provider 均验证);success callback 组装出完全符合 tech-design §2.3 schema 的 `usage.completed` 并 XADD 入 Redis Streams;`/v1/chat/completions` 与 `/v1/messages` 双协议同网关同鉴权服务
- 两个实现级发现(正式 gateway 实现时的已知输入):① pre-call hook 拿到的是对外模型名(router 解析前),provider 判定依赖 §2.2 的 `provider/model` 命名约定——该约定由此从「风格」升级为「机制依赖」;② LiteLLM 的 `/v1/messages` 对 openai 系模型走 Responses API 桥接(上游需支持 `/v1/responses`,真实 provider 满足),对 anthropic 模型为原生透传;③ 插件以 `plugins.<module>` 相对 `/app` 的文件路径加载,不走 PYTHONPATH
- 本机安装 colima + docker CLI(brew),作为本项目 docker compose 工作流的常驻运行时
- spike 简化项已记录在其 README(单层加密、无授权投影、无 Langfuse、无流式/失败路径断言),正式实现补齐
**引用**: test/litellm-spike/ · docs/architecture.md A3 #1/A4 · journal/TODO.md M1

## 2026-07-26 · monorepo 骨架 + packages/shared 事件契约(第一个正式代码 PR)

**目的**: 按「contracts before code」落地跨进程唯一接口,搭起 monorepo 与本地基础设施
**改动**:
- monorepo 骨架:pnpm workspace + turborepo + tsconfig.base(strict);工具链 node 26 + pnpm 11(esbuild 构建放行走 pnpm-workspace.yaml onlyBuiltDependencies,声明式可审计)
- `packages/shared`(zod v4,tsup 双格式构建):A5 全部 7 个事件 schema(公共信封 schema_version/event_id/ts 平铺)+ A4 三个 Redis 投影字段级 schema(含 Redis 键名构造函数、`events:<topic>` 流命名约定);M2+ 事件(ev/battle/settlement)只定义文档已明确的字段,模块设计时走 schema_version 升版
- usage.completed 相比 §2.3 示例新增 `estimated` 布尔(§2.2 已有语义,schema 补齐);tech-design §2.3 示例未改(default 语义,缺省 false,老事件兼容)
- JSON Schema 导出(zod v4 原生 toJSONSchema,draft 2020-12):10 个工件到 `packages/shared/schemas/json/`,随源码提交,供 gateway Python 侧校验
- 测试 15 个全过,其中 usage.completed 用 spike 抓的真实事件原样做回归样本
- `infra/docker-compose.yml`:Postgres 16 / Redis 7(AOF everysec,§2.3)/ ClickHouse 24.8,三容器 healthy 验证过;Langfuse/OpenBao 刻意推迟到对应模块(头注释说明)
- 本机安装 pnpm(npm -g);typescript 钉 ^5(7.x 与 tsup dts 插件不兼容)
- README 新增「开发」快速入口
**引用**: packages/shared/ · infra/docker-compose.yml · docs/architecture.md A4/A5 · journal/TODO.md M1
