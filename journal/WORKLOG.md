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
