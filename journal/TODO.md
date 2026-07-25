# TODO(集中待办)

> 规则见 `.cursor/rules/session-journal.mdc`:所有跨会话待办只记在这里。完成打勾并注明日期;新发现的事项当场补进来。

## 待用户拍板(阻塞项)

- [ ] `docs/REVIEW.md` 全部 Block 逐块过一遍并回填结论(Block 13 已裁定:纯记账制;其余 1–12 的默认值均未确认)
  - 重点:产品名、折算公式默认参数、EV 周衰减系数、技能池规模与属性克制表、全自动 vs 半自动战斗、质押档位数值、隐私模式默认开关
- [ ] 债务清偿模式(tech-design §10.3,败方 Key 承担胜方消耗)上线前过一次法务/合规确认:对 provider ToS 的影响、用户告知文案

## M1 开发(循环骨架:调用 → CP 记账可见)

- [ ] monorepo 骨架:pnpm + turborepo + `infra/docker-compose.yml`(Postgres 16 / Redis 7 / ClickHouse / Langfuse v3 / OpenBao)(architecture B1/B6)
- [ ] `packages/shared`:`usage.completed` 等 5 个事件的 zod schema(architecture A5),这是第一个 PR,先于一切业务代码
- [ ] 三个 Redis 投影的字段级 schema:平台 token 投影 / Key 路由投影 / 授权投影(architecture A4)
- [ ] LiteLLM Proxy 部署 + 3 个自研插件:auth_projection / usage_publisher(含本地 spool)/ langfuse 隐私回调(architecture A4)
- [ ] PostgreSQL 迁移:users / provider_keys / ledger_entries / credit_rules(architecture B3),ledger 双录一致性约束
- [ ] REST API 面设计:端点、错误码、鉴权方式(目前文档只有模块边界没有 API 面)
- [ ] 每日对账 BullMQ 任务:ledger vs LiteLLM 请求日志(tech-design §2.3)

## M2+(有依赖,暂不动手)

- [ ] EV 特征清单(tech-design §5.1)细化为 ClickHouse 物化视图定义(M2)
- [ ] `battle-core` 纯函数包的字段级契约:TrainerSnapshot / BattleConfig / TurnEvent(M2 末前定稿,architecture A5)
- [ ] 技能池首批 50 个技能的数值表(tech-design §7.1,需先拍板属性克制体系)
- [ ] 平台自营 Key 池 + CP 直购(用户已裁定推迟到 M4,REVIEW Block 2)
- [ ] 营养饮料等道具改现金购买,依赖 M5 支付系统(tech-design §6.3)
