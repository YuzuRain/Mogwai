# TODO(集中待办)

> 规则见 `.cursor/rules/session-journal.mdc`:所有跨会话待办只记在这里。完成打勾并注明日期;新发现的事项当场补进来。
> 2026-07-25 全部 REVIEW Block 已裁定(docs/REVIEW.md 汇总表),待办按模块重组。

## M1 · 循环骨架(调用 → CP 记账可见),直接开工

- [ ] **infra**:monorepo 骨架 pnpm + turborepo + `infra/docker-compose.yml`(Postgres 16 / Redis 7 / ClickHouse / Langfuse v3 / OpenBao)(architecture B1/B6)
- [ ] **shared**:`usage.completed` 等 5 个事件的 zod schema(architecture A5)——第一个 PR,先于一切业务代码
- [ ] **shared**:三个 Redis 投影的字段级 schema:平台 token 投影 / Key 路由投影 / 授权投影(architecture A4)
- [ ] **gateway**:LiteLLM Proxy 部署 + 3 个自研插件:platform_auth / key_resolver / usage_publisher(含本地 spool),Langfuse 隐私走内置 callback(architecture A4);provider 首发 5 家含火山方舟(tech-design §1.1)
- [ ] **billing**:PostgreSQL 迁移 users / provider_keys / ledger_entries / credit_rules(architecture B3),ledger 双录一致性约束;初始参数 1000 CP/USD、服务费 5%
- [ ] **core-app**:REST API 面设计:端点、错误码、鉴权方式(目前文档只有模块边界没有 API 面)
- [ ] **workers**:每日对账 BullMQ 任务:ledger vs LiteLLM 请求日志(tech-design §2.3)

## M2+ · 模块设计时再定(不前置拍板)

- [ ] **game(M2)**:EV 特征清单(tech-design §5.1)细化为 ClickHouse 物化视图定义;IV 窄幅随机分配算法(总和 126、单项 13~29)落到注册流程
- [ ] **battle(M2 末)**:`battle-core` 字段级契约:TrainerSnapshot / BattleConfig / TurnEvent(architecture A5)
- [ ] **game(M3)**:技能池首批 40 个技能数值表(N 16 / R 13 / SR 8 / UR 3);属性体系首发用宝可梦 18,模块设计时重评估自创 AI 主题属性(REVIEW Block 7)
- [ ] **battle(M3)**:战斗表现细节:动画时长、跳过交互(REVIEW Block 9)
- [ ] **match(M4)**:质押档位数值(REVIEW Block 8)
- [ ] **billing(M4)**:平台自营 Key 池 + CP 直购(margin 1.15),随支付启用(REVIEW Block 2)
- [ ] **合规(M4 前)**:债务清偿模式(tech-design §10.3)过法务:败方 Key 承担胜方消耗对 provider ToS 的影响、用户告知文案
- [ ] **game(M5)**:赛季机制 + EV 赛季重置规则(周衰减已取消,REVIEW Block 5);满级溢出 EXP 转赛季币;营养饮料等道具现金购买(依赖支付)

## 长线(条件触发)

- [ ] 折算公式改动双人审批:多人协作后启用(当前单人审批,REVIEW Block 3)
- [ ] 数据回流/数据资产专项设计:明文数据全量回流后的加工、隐私分级与商业化,「后面一定会有比较重的设计」(REVIEW Block 4)
- [ ] 客户端形态演进:纯 CLI addon 方案评估(采集已钉网关,外壳可替换,tech-design §1.4 #5)
- [ ] 网关替换预案:LiteLLM P99 不达标时切 Bifrost(architecture A3)
