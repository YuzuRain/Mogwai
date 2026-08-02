"""rpm 限流接线断言(architecture A3 #3,journal/TODO 审计项)。

token 投影的可选 rpm/tpm 字段 → platform_auth 设置 UserAPIKeyAuth 的
rpm_limit/tpm_limit → litellm 内置限流器执行(超限 429)。
tpm 走同一条赋值路径,超限判定在响应后累计,不单独造用例。

u_ratelimited 的投影带 rpm=1:连发 3 次,无论是否跨分钟窗口,
至少有一个窗口落入 ≥2 个请求,必出 429。
"""

from __future__ import annotations

from conftest import TOKENS, chat


def test_rpm_limit_from_projection_is_enforced(redis_client):
    statuses = [
        chat(TOKENS["u_ratelimited"], "openai/gpt-4o-mini").status_code for _ in range(3)
    ]
    assert statuses[0] == 200, f"first request must pass, got {statuses}"
    assert 429 in statuses, f"rpm=1 must reject a burst of 3, got {statuses}"


def test_rate_limit_does_not_leak_to_other_tokens(redis_client):
    # u_ok 的投影不带 rpm/tpm:不受 u_ratelimited 触发的限流影响
    assert chat(TOKENS["u_ok"], "openai/gpt-4o-mini").status_code == 200
