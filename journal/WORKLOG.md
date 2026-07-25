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
