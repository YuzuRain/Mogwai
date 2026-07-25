# LiteLLM Spike — 验证网关插件架构的三个扩展点

> M1 最大风险前置验证(journal/TODO.md M1 第一项)。本目录是**一次性 spike**,不属于正式 monorepo 布局;
> 结论回写 WORKLOG 后,正式实现进入 `gateway/`,本目录随之删除或归档。

## 验证目标(对应 architecture.md A4)

| # | 扩展点 | 要证明的事 |
|---|---|---|
| 1 | `custom_auth` | 平台 token → 读 Redis token 投影 → 认出 user_id / 拒绝未知 token |
| 2 | pre-call hook | 读 Redis Key 路由投影 → AES-256-GCM 解密 Provider Key → 注入本次请求(上游真实收到解密后的 Key) |
| 3 | success callback | 组装 `usage.completed`(tech-design §2.3 schema)→ XADD 到 Redis Streams |
| 4 | 双协议 | 同一网关同时服务 OpenAI `/v1/chat/completions` 与 Anthropic `/v1/messages`(Claude Code 接入硬需求,tech-design §2.2) |

## 组件

- `litellm-config.yaml` + `plugins/`:LiteLLM Proxy 与三个薄插件(与 A4 同名:platform_auth / key_resolver / usage_publisher)
- `fake_provider/`:**测试替身**(仅替代付费 LLM API,符合 no-mocks 规则):OpenAI 兼容上游,
  把收到的 Authorization 头写入 Redis 供断言——用于证明 Key 注入真实到达上游
- `seed/`:一次性种子容器,写入两个 Redis 投影(token 投影 + Key 路由投影,Key 密文为 AES-256-GCM)
- `verify.sh`:端到端断言脚本

## 运行

```bash
docker-compose up -d --build   # 或 docker compose
./verify.sh
docker-compose down -v
```

## 简化项(spike 明确不覆盖,正式实现补齐)

- 信封加密只做单层(KEK 直接加密 Key,未做 DEK 层);KEK 是写死的测试常量;
- 授权投影(欠费/债务清偿路由)未覆盖——扩展点机制与 Key 路由投影同构,不需单独验证;
- 未接 Langfuse(`langfuse_trace_id` 置 null);未验证流式 usage 汇总;
- 失败路径 callback 未断言(仅成功路径)。
