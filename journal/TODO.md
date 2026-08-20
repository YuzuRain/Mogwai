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
- [x] **gateway**:流式(SSE)集成用例——双协议增量透传 + 流尾 usage 事件断言;**修出一个真 bug**:OpenAI 兼容上游必须在 litellm_params 强制 `stream_options.include_usage`,否则 litellm 丢弃 provider 回报的 usage 并用自身 tokenizer 重算(42→9 且不带 estimated 标记),流式主流量的账全是静默估算值(2026-08-03 完成,gateway/README.md 已固化「新增 provider 必带此参数」)
- [x] **gateway**:rpm/tpm 限流接线——platform_auth 读投影可选字段设 UserAPIKeyAuth rpm_limit/tpm_limit,litellm 内置限流器执行;值损坏响亮失败;rpm=1 连发用例 + 不串台用例(2026-08-03 完成)
- [ ] **account(落地时)**:OpenBao 进 infra compose 后,给 gateway `OpenBaoTransitKms` 补真实集成测试——当前该后端代码存在但从未打过真实 OpenBao,只有 env_kek 被测试覆盖(gateway/plugins/kms.py)
- [ ] **billing**:`events:usage.completed` 的 trim 策略——billing 消费组已注册(2026-08-02),仍无 MAXLEN,stream 无限增长;策略在其余消费组(game.exp/telemetry/realtime)注册方式定下后定,生产部署前必须解决(architecture A5)
- [x] **web**:M1 控制台(`apps/web`,Next.js :3100,/api 反代 core-app 保持同源):登录注册(better-auth)/ 概览(接入三步)/ **接入指南页**(选工具 → 生成配置片段,5 工具全覆盖,纯函数 + 4 单测)/ token 签发(明文一次)/ Key 托管(录入即探测,状态短轮询)/ 账单(positions + ledger 分页 + snapshot 逐笔追溯)/ 设置(privacy_mode)(2026-08-03 完成:响应过 shared zod 契约校验;浏览器端到端冒烟全流程通过,真实事件 → 账单追溯可见;修 core-app better-auth trustedOrigins——反代场景 Origin 是 web 源,不信任则全部 auth 请求 403)
- [x] **billing**:PostgreSQL 迁移 users / provider_keys / ledger_entries / credit_rules(architecture B3),ledger 双录一致性约束;初始参数 1000 CP/USD、服务费 5%(2026-07-28 完成:`apps/core-app` drizzle schema + `infra/migrations`,双录 sum=0 延迟触发器 + append-only 触发器 + (event_id,seq) 幂等键 + PLATFORM 哨兵;公式并入 config_versions 待追认,REVIEW Block 14;11 集成测试打真实 Postgres 全过)
- [x] **core-app**:REST API 面设计:端点、错误码、鉴权方式(2026-07-28 完成:architecture B4.1 定稿管理面契约——better-auth session 鉴权、错误信封 + 错误码注册表、cursor 分页、14 个 M1 端点及投影副作用归属;DTO/错误码/枚举 zod 单一权威落 `packages/shared` src/api/ + src/domain/,core-app 表定义改引 shared 枚举消除重复)
- [x] **core-app**:NestJS 应用骨架 + account 模块实现(better-auth 集成、token 签发/吊销写投影、Key 托管信封加密 + 异步探测校验写投影,按 B4.1 契约)——完成后 gateway 才有真实投影写入方,脱离手工 seed(2026-08-02 完成:`apps/core-app/src`,错误信封/zod 管道/显式 @Inject 注入;平台 token 自研签发含 platform_tokens 表,B1「api-key 插件」备注已更正;TS 信封加密与 gateway kms.py 线格式互通由跨语言向量锁死 `gateway/tests/test_kms_vector.py`;11 集成测试打真实 Postgres+Redis+完整 Nest 应用)
- [x] **billing**:usage.completed 消费者:公式求值(`packages/formula-engine` 安全 DSL 引擎)→ 复式记账((event_id,seq) 幂等)→ 授权投影刷新;坏事件进 DLQ `billing:dlq:usage.completed` 不中断消费;price_table v1 进 config_versions(新 namespace);positions/ledger 只读端点(keyset 分页);core-worker 入口 `pnpm --filter @mogwai/core-app worker`(2026-08-02 完成:9 集成测试真实 PG+Redis 全链路;M1 核心循环「调用 → CP 记账可见」后端段已通)
- [x] **billing**:DLQ 巡检与重放工具(2026-08-18 完成:`scripts/dlq.ts` list/replay,重放 = XADD 回流 + 出列,消费者幂等兜底;注意:根因未修就重放只会回到 DLQ,且原始消息会被下次对账重复入列——无害但有噪音,集成测试已固化该语义)
- [ ] **billing**:price_table v1 上线前对照各 provider 官方刊例价复核(seed 值按 2026-07 公开价录入,apps/core-app/src/seed/seed-config.ts)——**用户参与项**,与真实 Key 冒烟同批做
- [ ] **account**:admin 角色机制随 better-auth admin 插件落地(B4.1:admin 端点鉴权依赖它;admin config 三端点尚未实现——读取侧 AdminConfigService 已就位,写入/激活端点等角色机制)
- [x] **workers**:Key 健康巡检(2026-08-18 完成:BullMQ 每 6h,`AccountService.patrolKeys` 归 account 模块所有,workers 只调度;探测新增 429→throttled 语义,active↔throttled↔invalid 全流转 + 路由投影同步;「通知用户」M1 = ERROR 日志 + 控制台状态可见,通知通道随 realtime/M2)
- [ ] **billing(熔断裁定后)**:blocked 标记接线——REVIEW Block 15 裁定阈值后:授权投影 `blocked` 置位 + token 投影 blocked 标记下发(且 account 的 privacy 同步不得覆盖——当前投影漂移自愈会把 blocked 重置为 "0" 并留 ERROR 日志,projections.service.ts;tech-design §2.5 要求 billing 在账本扫描时重新下发)
- [x] **workers**:每日对账 BullMQ 任务,M1 范围 stream ↔ ledger(2026-08-18 完成:`BillingReconciler` 归 billing 模块,26h 窗口/5min 尾部宽限/Redis TIME 为时钟基准;漏账走消费者同一 `bill()` 入口幂等补记 + 告警,DLQ 深度告警)
- [ ] **billing(Block 16 裁定后)**:对账叠加网关侧独立数据源(抓发布端丢失;推荐 M2 用 Langfuse trace,见 docs/REVIEW.md Block 16)

## Harness 插件转向(2026-08-19,分支 redesign/harness-plugin,架构 A6)

- [ ] **REVIEW Block 17/18 裁定**(用户):采集通道(推荐 session/event 自建出站)、路由挂载方式(推荐复用 llm-pi-ai)——裁定前不开工插件实现
- [ ] **product.html**:接入故事随产品重设计更新(用户主导的产品文档改版,harness 插件为一等接入形态)
- [ ] **shared**:`behavior.tracked` 的 payload 词汇细化为规范化行为事件 schema(turn.completed / tool.called / request.retried / usage.observed / session.summary,vendor 中立,tech-design §4.2)
- [ ] **harness-core**:批量上报客户端——spool / 重试 / `(session_id, event_seq)` 幂等 / consent fail-closed(未同意不上报)/ 明文→统计特征过滤(A6 铁律 3)
- [ ] **harness-dsh**:Cordis 插件——路由挂载(网关 baseURL + 平台 token)+ `session/event` 订阅映射;dsh 版本必须 pin(developer preview 无兼容承诺);npm 发布 + `dsh-plugin` topic
- [ ] **telemetry**:ingest API `POST /api/v1/telemetry/events`(平台 token 鉴权、shared schema 校验、幂等去重、按用户限流)→ 发布 `behavior.tracked`(B4.1 数据上报面)
- [ ] **game(M2,依赖上面)**:harness 行为特征与网关 usage.completed 的交叉核验管道(锚定规则:同窗口 token 量级 + provider/model 一致,tech-design §4.2 信任边界)
- [ ] **harness-dsh(M2+,依赖 realtime)**:harness 内实时反馈——EXP 飘字/等级条经 dsh UI slot(`shell.overlay` 等,A6)挂进 harness 界面,消费 §2.4 实时反馈通道;不进首版插件范围

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
- [ ] 客户端形态演进:CLI / addon 获客层评估(2026-07-25 讨论已定框架,tech-design §1.4 #5 数据面分级;**2026-08-19 更新**:harness 插件转向已实现此路线的主体——有插件生态的 harness 走 harness-core+适配器,下述本地工件读取路线降级为「无插件生态工具」的补充,优先级进一步后移):
  - `mogwai init` 接入器:检测本机工具、写 base URL/token 配置(纯接入,不采集);
  - 练习赛数据面(低信任,只进练习赛/成长展示,永不进正式数值与经济):Claude Code 读本地 `~/.claude/projects/*.jsonl`(完整 transcript + token 用量,质量最高)/ Cursor 用量 CSV 用户手动导出上传(仅聚合量,非官方端点不做 cookie 自动化)/ Trae 待调研;事件带 `source=addon` 标记与独立信任权重;本地工件 schema 随工具版本变化,读取器按「坏了修」维护,不上关键路径;隐私显式同意(transcript 含完整代码库内容);
  - 前提:核心循环先为 API Key 用户跑通,此项不早于 M5
- [ ] 网关替换预案:LiteLLM P99 不达标时切 Bifrost(architecture A3)
