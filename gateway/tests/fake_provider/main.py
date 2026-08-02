"""fake_provider: OpenAI/Anthropic 兼容上游的测试替身。

只替代付费 LLM API(no-mocks 规则允许的唯一豁免)。为了让测试能断言
Key 注入真实发生,它把收到的鉴权头写入 Redis;模型名含 "err" 时返回 500,
用于驱动网关的失败回调路径。

流式(SSE):两个端点都支持 ``stream: true``。上游**总是**在流尾回报
usage(prompt 42 / completion 7,与非流式一致)——计费断言依赖这两个
数字,验证网关取的是 provider 回报值而非自行估算。
"""

import json
import os
import time
import uuid

import redis
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

app = FastAPI()
r = redis.Redis(host=os.environ["REDIS_HOST"], port=6379, decode_responses=True)

OPENAI_AUTH_KEY = "test:last_openai_auth"
ANTHROPIC_AUTH_KEY = "test:last_anthropic_auth"

REPLY_CHUNKS = ["fake ", "streaming ", "reply"]
USAGE = {"prompt_tokens": 42, "completion_tokens": 7, "total_tokens": 49}


def _openai_stream(model: str):
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    base = {"id": completion_id, "object": "chat.completion.chunk", "created": int(time.time()), "model": model}
    for text in REPLY_CHUNKS:
        yield "data: " + json.dumps(
            {**base, "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}]}
        ) + "\n\n"
    yield "data: " + json.dumps(
        {**base, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]}
    ) + "\n\n"
    # OpenAI 语义:usage 单独一个 choices 为空的收尾 chunk
    yield "data: " + json.dumps({**base, "choices": [], "usage": USAGE}) + "\n\n"
    yield "data: [DONE]\n\n"


def _anthropic_stream(model: str):
    def event(name: str, payload: dict) -> str:
        return f"event: {name}\ndata: {json.dumps(payload)}\n\n"

    yield event(
        "message_start",
        {
            "type": "message_start",
            "message": {
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "type": "message",
                "role": "assistant",
                "model": model,
                "content": [],
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {"input_tokens": 42, "output_tokens": 1},
            },
        },
    )
    yield event(
        "content_block_start",
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
    )
    for text in REPLY_CHUNKS:
        yield event(
            "content_block_delta",
            {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": text}},
        )
    yield event("content_block_stop", {"type": "content_block_stop", "index": 0})
    # Anthropic 语义:output usage 在 message_delta 里给最终值
    yield event(
        "message_delta",
        {
            "type": "message_delta",
            "delta": {"stop_reason": "end_turn", "stop_sequence": None},
            "usage": {"output_tokens": 7},
        },
    )
    yield event("message_stop", {"type": "message_stop"})


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    r.set(OPENAI_AUTH_KEY, request.headers.get("authorization", "<missing>"))
    body = await request.json()
    model = body.get("model", "gpt-4o-mini")
    if "err" in model:
        return JSONResponse(status_code=500, content={"error": {"message": "upstream boom"}})
    if body.get("stream"):
        return StreamingResponse(_openai_stream(model), media_type="text/event-stream")
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
        "usage": USAGE,
    }


@app.post("/v1/messages")
async def anthropic_messages(request: Request):
    r.set(ANTHROPIC_AUTH_KEY, request.headers.get("x-api-key", "<missing>"))
    body = await request.json()
    model = body.get("model", "claude-3-haiku")
    if body.get("stream"):
        return StreamingResponse(_anthropic_stream(model), media_type="text/event-stream")
    return {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": [{"type": "text", "text": "fake upstream reply"}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": 42, "output_tokens": 7},
    }


@app.post("/{path:path}")
async def catch_all(path: str, request: Request):
    r.set("test:last_unknown_path", "/" + path)
    return JSONResponse(status_code=404, content={"detail": f"fake_provider: no route /{path}"})
