# gateway — LLM 网关(LiteLLM Proxy + mogwai 插件)

独立部署单元(architecture A4),不属于 TS monorepo。对上只承诺两种 wire format
(OpenAI 兼容 API + Anthropic `/v1/messages`),对下只承诺 `usage.completed`
事件 schema;所有自定义逻辑收敛在三个薄插件里,换掉 LiteLLM 运行时两侧无感。

**网关不碰业务**:只依赖 Redis(读投影、发事件)与 KMS(解 DEK),不触
PostgreSQL,不含任何业务规则(欠费阈值等判定由 billing 预计算成投影里的
标记,网关只读标记)。

## 目录

```
gateway/
├── litellm-config.yaml   # 生产配置:5 provider 通配路由、custom_auth、callbacks
├── Dockerfile            # litellm 官方镜像 + 插件 + JSON Schema 契约工件
├── plugins/              # mogwai 扩展(Python,扁平模块,互相以模块名导入)
│   ├── mogwai_common.py  # Redis 连接、env 配置、投影/流命名(镜像 packages/shared)
│   ├── kms.py            # KMS 客户端接口 + env_kek(dev)/ openbao_transit 两实现
│   ├── spool.py          # usage 事件本地 spool(独立模块,可单测)
│   ├── platform_auth.py  # ① custom_auth hook
│   ├── key_resolver.py   # ② pre-call hook
│   └── usage_publisher.py# ③ success/failure callback
└── tests/                # 集成测试(pytest,全部打真实依赖,见下)
```

## 一次请求的生命周期

```
客户端(Bearer 平台 token,model = provider/model)
  │
  ▼ ① platform_auth(custom_auth hook)
  sha256(token) → 读 token 投影 proj:token:<hash>
  未知 → 401;token 拒绝标记 → 403;
  授权投影 proj:authz:<user_id> 的 billing 裁定 blocked → 402(软预检,§2.5)
  │
  ▼ ② key_resolver(pre-call hook)          路由优先级(tech-design §2.2):
  1. 债务清偿路由(授权投影 credits)——M4 交付,当前有债权即响亮报错
  2. 本人 BYOK:读 proj:keys:<user_id>,按 provider + 模型白名单匹配
     (白名单为空 = 该 provider 全模型可用)
     → KMS 解 DEK → AES-GCM 解 Key 明文 → 注入本次请求(内存中用完即弃)
  3. 平台 Key 池——M4+,首发纯 BYOK,无 Key 命中返回 400
  │
  ▼ LiteLLM 路由 → 上游 provider(重试/熔断由 LiteLLM 托管)
  │
  ▼ ③ usage_publisher(success/failure callback)
  组装 usage.completed → 按 packages/shared 导出的 JSON Schema 校验(不合法即抛)
  → XADD events:usage.completed;XADD 失败写本地 spool,后续回调时自动补投
  (消费方按 event_id 幂等去重,重复投递安全)
```

对外模型名必须是 `provider/model`(如 `openai/gpt-4o`)。这不是风格偏好:
pre-call hook 先于 LiteLLM 路由决议执行,provider 只能从模型名前缀取
(spike 结论,WORKLOG 2026-07-25)。

## 契约

网关消费/生产的所有数据结构以 `packages/shared`(zod)为权威:

| 数据 | Redis 键 | shared 定义 | 写方 |
|---|---|---|---|
| token 投影 | `proj:token:<sha256>` | `projections/token.ts` | account |
| Key 路由投影 | `proj:keys:<user_id>` | `projections/key-routing.ts` | account |
| 授权投影 | `proj:authz:<user_id>` | `projections/authorization.ts` | billing |
| usage 事件 | `events:usage.completed` | `events/usage-completed.ts` | gateway(本模块) |

Python 侧按 `pnpm export:schemas` 导出的 JSON Schema 工件校验(打进镜像的
`/app/schemas`)。**shared 里改契约,必须同一提交里重建镜像并跑本模块测试。**

## KMS(信封加密外层,architecture A3 #22)

`encrypted_dek` 的解包走 `plugins/kms.py` 的统一接口,按环境选后端:

| `MOGWAI_KMS_BACKEND` | 实现 | 用途 | `encrypted_dek` 线格式 |
|---|---|---|---|
| `env_kek`(默认) | KEK 放环境变量,进程内 AES-GCM 解包 | 本地开发/测试 | base64(12B nonce ‖ GCM 密文) |
| `openbao_transit` | OpenBao Transit `decrypt` API | 自托管生产 | base64(`vault:v1:...`) |
| 云 KMS | 随生产基础设施接入(M4+) | 生产 | 随实现定 |

## 配置(环境变量)

| 变量 | 默认 | 说明 |
|---|---|---|
| `MOGWAI_REDIS_URL` | `redis://redis:6379/0` | 投影与事件流所在 Redis |
| `MOGWAI_KMS_BACKEND` | `env_kek` | 见上表 |
| `MOGWAI_DEV_KEK` | — | env_kek 后端的 32 字节 KEK(hex),仅开发环境 |
| `OPENBAO_ADDR` / `OPENBAO_TOKEN` / `OPENBAO_TRANSIT_KEY` | — / — / `mogwai-kek` | openbao_transit 后端 |
| `MOGWAI_SCHEMA_DIR` | `/app/schemas` | JSON Schema 契约工件目录(镜像内置) |
| `MOGWAI_SPOOL_PATH` | `/var/lib/mogwai/usage-spool.jsonl` | 事件补投 spool 文件 |

## 运行

```bash
# 本地(需先 pnpm export:schemas,镜像会打包契约工件)
docker-compose -f infra/docker-compose.yml --profile gateway up -d
# 网关在 :4000;需要给 redis 里灌投影后才能通过鉴权(由 account/billing 写入)
```

## 测试

```bash
gateway/tests/run.sh   # 一键:构建 → 起真实 Redis + 测试替身上游 + 网关 → pytest → 清理
```

- 全部断言打**真实依赖**(no-mocks 规则):真实 Redis、真实 LiteLLM 容器;
  唯一替身是 `tests/fake_provider/`(付费 LLM API 的测试替身,规则允许的豁免),
  它把收到的鉴权头写回 Redis,使「Key 确实被解密注入」可以逐字节断言;
- 13 个用例覆盖 M1 验收:401/403/402 鉴权矩阵、BYOK 解密注入、模型白名单、
  裸模型名拒绝、债务路由响亮失败、双协议(含 `/v1/messages` 回调的 provider
  归因)、成功/失败两路 usage 事件按契约工件校验、spool 落盘与补投;
- `tests/litellm-config.test.yaml` 与生产配置的唯一差异是 api_base 指向替身,
  插件与鉴权设置一致。

## 已知边界(有意为之,勿"顺手修")

因等待其他模块(现在的行为 → 谁来解除):

- **token / Key 路由投影已有生产写入方**(2026-08-02):account 模块
  (apps/core-app)在 token 签发、Key 托管激活时同步写入;信封线格式互通由
  跨语言向量测试锁死(tests/test_kms_vector.py ↔ apps/core-app envelope.ts)。
  授权投影仍等 billing——缺失 = 放行,见下一条;
- **授权投影缺失 = 放行(fail-open)**:新用户没有账本活动就没有投影,这是
  正常态;billing 上线后必须保证「有账本活动就有投影」,否则欠费用户裸奔;
- **`usage.completed` 尚无消费者**:没有消费组、没有 MAXLEN,stream 无限增长;
  trim 策略等全部消费组注册方式定下后再定,生产部署前必须解决(TODO);
- **事件校验失败/构造失败 = 事件丢失**,当前只有 litellm 错误日志兜底;
  最后一道防线是 workers 的每日对账(ledger vs 网关请求日志),该任务未建;
- **`OpenBaoTransitKms` 未经真实集成测试**:只有 env_kek 后端被测试覆盖,
  OpenBao 随 account 模块进 infra 后补(TODO);
- **债务清偿路由 = M4**:授权投影里出现 credits 时 key_resolver 直接抛
  NotImplementedError(响亮失败,no-mocks 规则)。落地时需先补契约:
  `usage.completed.key_source` 需要债务路由变体 + 债务人引用(journal/TODO.md M4);
- **平台 Key 池 = M4+**:无 BYOK Key 命中即 400,不存在静默 fallback;
- **Langfuse callback = M2**:随 telemetry 模块接入,`langfuse_trace_id` 暂为
  null(事件 schema 已预留);privacy_mode 已透传到鉴权元数据,执行点随之落地。

gateway 自身欠的(不被其他模块阻塞,journal/TODO.md M1):

- **流式(SSE)无测试覆盖**:13 个用例全部非流式,而 coding agent 主流量是流式;
- **rpm/tpm 限流未接线**:token 投影 schema 已有字段,platform_auth 未读取;
- **qwen→dashscope、火山方舟→volcengine 的适配映射未经真实 Key 冒烟**
  (测试替身只覆盖 OpenAI/Anthropic 两种 wire format);拿到真实 Key 后需
  人工冒烟,不进 CI。
