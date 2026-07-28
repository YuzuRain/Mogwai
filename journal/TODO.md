# TODO(集中待办)

> 规则见 `.cursor/rules/session-journal.mdc`:所有跨会话待办只记在这里。完成打勾并注明日期;新发现的事项当场补进来。
> 2026-07-25 全部 REVIEW Block 已裁定(docs/REVIEW.md 汇总表),待办按模块重组。

## M1 · 循环骨架(调用 → CP 记账可见),直接开工

- [x] **infra**:monorepo 骨架 pnpm + turborepo + `infra/docker-compose.yml`(Postgres 16 / Redis 7 / ClickHouse)(architecture B1/B6)(2026-07-26 完成;Langfuse v3 随 M2 telemetry、OpenBao 随 account Key 托管再加入,理由见 compose 头注释)
- [x] **shared**:A5 全部 7 个事件的 zod schema + JSON Schema 导出(architecture A5)——第一个 PR,先于一切业务代码(2026-07-26 完成,15 测试含 spike 真实事件回归)
- [x] **shared**:三个 Redis 投影的字段级 schema:平台 token 投影 / Key 路由投影 / 授权投影(architecture A4)(2026-07-26 完成)
- [x] **gateway(第一步,验证最大风险)**:LiteLLM spike——验证 custom_auth / pre-call hook / success callback 三个扩展点能读 Redis 投影、注入解密 Key、组装 usage 事件;不成立则启动 Bifrost/自研预案(architecture A3 #1)(2026-07-25 完成,6/6 断言通过,`test/litellm-spike/`,结论见 WORKLOG)
- [x] **gateway**:LiteLLM Proxy 部署 + 3 个自研插件:platform_auth / key_resolver / usage_publisher(含本地 spool),Langfuse 隐私走内置 callback(architecture A4);provider 首发 5 家含火山方舟(tech-design §1.1);**验收含双协议:OpenAI 兼容 + Anthropic `/v1/messages`(Claude Code 接入硬需求,tech-design §2.2)**(2026-07-27 完成:`gateway/`,13 集成测试全过,含 KMS 双后端接口与 spool 落盘/补投;Langfuse callback 顺延到 M2 telemetry,见 gateway/README.md 已知边界)
- [ ] **gateway**:qwen→dashscope、火山方舟→volcengine 适配映射的真实 Key 人工冒烟(测试替身只覆盖 OpenAI/Anthropic 两种 wire format;不进 CI,gateway/README.md 已知边界)——**用户参与项**:等 account 模块能正常录 Key 后做,届时由 agent 出两分钟操作清单(2026-07-28 约定)
- [ ] **gateway**:流式(SSE)集成用例——coding agent 主流量是流式,当前 13 个测试全部非流式;需验证流式透传 + 流结束后 usage 事件正确发布(fake_provider 补 SSE 响应)(2026-07-28 审计发现,不被其他模块阻塞)
- [ ] **gateway**:rpm/tpm 限流接线——token 投影 schema 已有字段(shared projections/token.ts),platform_auth 未读取、未设置到 UserAPIKeyAuth(architecture A3 #3);不被其他模块阻塞,数据侧等 account 写投影(2026-07-28 审计发现)
- [ ] **account(落地时)**:OpenBao 进 infra compose 后,给 gateway `OpenBaoTransitKms` 补真实集成测试——当前该后端代码存在但从未打过真实 OpenBao,只有 env_kek 被测试覆盖(gateway/plugins/kms.py)
- [ ] **billing(首个消费者落地时)**:`events:usage.completed` 的 trim 策略——当前无消费组、无 MAXLEN,stream 无限增长;策略必须在全部消费组(billing/game.exp/telemetry/realtime)注册方式定下后才能定,生产部署前必须解决(architecture A5)
- [ ] **web**:接入指南页(控制台一等公民):选工具 → 生成配置片段,覆盖 Claude Code / Codex CLI / Cline / Cursor / Trae(tech-design §2.2)
- [x] **billing**:PostgreSQL 迁移 users / provider_keys / ledger_entries / credit_rules(architecture B3),ledger 双录一致性约束;初始参数 1000 CP/USD、服务费 5%(2026-07-28 完成:`apps/core-app` drizzle schema + `infra/migrations`,双录 sum=0 延迟触发器 + append-only 触发器 + (event_id,seq) 幂等键 + PLATFORM 哨兵;公式并入 config_versions 待追认,REVIEW Block 14;11 集成测试打真实 Postgres 全过)
- [x] **core-app**:REST API 面设计:端点、错误码、鉴权方式(2026-07-28 完成:architecture B4.1 定稿管理面契约——better-auth session 鉴权、错误信封 + 错误码注册表、cursor 分页、14 个 M1 端点及投影副作用归属;DTO/错误码/枚举 zod 单一权威落 `packages/shared` src/api/ + src/domain/,core-app 表定义改引 shared 枚举消除重复)
- [ ] **core-app**:NestJS 应用骨架 + account 模块实现(better-auth 集成、token 签发/吊销写投影、Key 托管信封加密 + 异步探测校验写投影,按 B4.1 契约)——完成后 gateway 才有真实投影写入方,脱离手工 seed
- [ ] **account(实现时)**:admin 角色机制随 better-auth admin 插件落地(B4.1:admin 端点鉴权依赖它)
- [ ] **workers**:每日对账 BullMQ 任务:ledger vs LiteLLM 请求日志(tech-design §2.3)

## M2+ · 模块设计时再定(不前置拍板)

- [ ] **game(M2)**:EV 特征清单(tech-design §5.1)细化为 ClickHouse 物化视图定义——**以网关流量特征为主数据源**(相邻高相似请求、会话节奏、工具调用模式、上下文长度分布;tracking-sdk 仅覆盖控制台,tech-design §4.2);IV 窄幅随机分配算法(总和 126、单项 13~29)落到注册流程
- [ ] **battle(M2 末)**:`battle-core` 字段级契约:TrainerSnapshot / BattleConfig / TurnEvent(architecture A5)
- [ ] **game(M3)**:技能池首批 40 个技能数值表(N 16 / R 13 / SR 8 / UR 3);属性体系首发用宝可梦 18,模块设计时重评估自创 AI 主题属性(REVIEW Block 7)
- [ ] **battle(M3)**:战斗表现细节:动画时长、跳过交互(REVIEW Block 9)
- [ ] **match(M4)**:质押档位数值(REVIEW Block 8)
- [ ] **billing(M4)**:平台自营 Key 池 + CP 直购(margin 1.15),随支付启用(REVIEW Block 2)
- [ ] **battle/billing(M4)**:清偿路由两个已知设计输入(tech-design §10.3):provider 匹配缺口的债务滞留策略;清偿调用丢 prompt cache / 受债务人 rate limit 的范围限定策略
- [ ] **gateway/shared(M4)**:债务清偿路由落地前先补契约:`usage.completed.key_source` 增加债务路由变体 + 债务人引用字段(billing 冲销记账需要知道该次调用跑在谁的 Key 上);当前 key_resolver 遇到 credits 直接 NotImplementedError(gateway/plugins/key_resolver.py)
- [ ] **合规(M4 前)**:债务清偿模式(tech-design §10.3)过法务:败方 Key 承担胜方消耗对 provider ToS 的影响、用户告知文案
- [ ] **game(M5)**:赛季机制 + EV 赛季重置规则(周衰减已取消,REVIEW Block 5);满级溢出 EXP 转赛季币;营养饮料等道具现金购买(依赖支付)

## 长线(条件触发)

- [ ] 折算公式改动双人审批:多人协作后启用(当前单人审批,REVIEW Block 3)
- [ ] 数据回流/数据资产专项设计:明文数据全量回流后的加工、隐私分级与商业化,「后面一定会有比较重的设计」(REVIEW Block 4)
- [ ] 客户端形态演进:CLI / addon 获客层评估(2026-07-25 讨论已定框架,tech-design §1.4 #5 数据面分级):
  - `mogwai init` 接入器:检测本机工具、写 base URL/token 配置(纯接入,不采集);
  - 练习赛数据面(低信任,只进练习赛/成长展示,永不进正式数值与经济):Claude Code 读本地 `~/.claude/projects/*.jsonl`(完整 transcript + token 用量,质量最高)/ Cursor 用量 CSV 用户手动导出上传(仅聚合量,非官方端点不做 cookie 自动化)/ Trae 待调研;事件带 `source=addon` 标记与独立信任权重;本地工件 schema 随工具版本变化,读取器按「坏了修」维护,不上关键路径;隐私显式同意(transcript 含完整代码库内容);
  - 前提:核心循环先为 API Key 用户跑通,此项不早于 M5
- [ ] 网关替换预案:LiteLLM P99 不达标时切 Bifrost(architecture A3)
