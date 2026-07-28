"""fake_provider: OpenAI/Anthropic 兼容上游的测试替身。

只替代付费 LLM API(no-mocks 规则允许的唯一豁免)。为了让测试能断言
Key 注入真实发生,它把收到的鉴权头写入 Redis;模型名含 "err" 时返回 500,
用于驱动网关的失败回调路径。
"""

import os
import time
import uuid

import redis
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
r = redis.Redis(host=os.environ["REDIS_HOST"], port=6379, decode_responses=True)

OPENAI_AUTH_KEY = "test:last_openai_auth"
ANTHROPIC_AUTH_KEY = "test:last_anthropic_auth"


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    r.set(OPENAI_AUTH_KEY, request.headers.get("authorization", "<missing>"))
    body = await request.json()
    model = body.get("model", "gpt-4o-mini")
    if "err" in model:
        return JSONResponse(status_code=500, content={"error": {"message": "upstream boom"}})
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "fake upstream reply"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 42, "completion_tokens": 7, "total_tokens": 49},
    }


@app.post("/v1/messages")
async def anthropic_messages(request: Request):
    r.set(ANTHROPIC_AUTH_KEY, request.headers.get("x-api-key", "<missing>"))
    body = await request.json()
    return {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "type": "message",
        "role": "assistant",
        "model": body.get("model", "claude-3-haiku"),
        "content": [{"type": "text", "text": "fake upstream reply"}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": 42, "output_tokens": 7},
    }


@app.post("/{path:path}")
async def catch_all(path: str, request: Request):
    r.set("test:last_unknown_path", "/" + path)
    return JSONResponse(status_code=404, content={"detail": f"fake_provider: no route /{path}"})
