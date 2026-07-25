"""fake_provider: OpenAI-compatible upstream TEST DOUBLE.

Stands in for a paid LLM provider only (allowed by the no-mocks rule). Records
the Authorization header it receives into Redis so verify.sh can assert that
key_resolver injected the decrypted BYOK key end-to-end.
"""

import os
import time
import uuid

import redis
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
r = redis.Redis(host=os.environ["REDIS_HOST"], port=6379, decode_responses=True)

LAST_AUTH_KEY = "spike:last_provider_auth"
LAST_ANTHROPIC_AUTH_KEY = "spike:last_anthropic_auth"


@app.get("/v1/models")
def models():
    return {"object": "list", "data": [{"id": "gpt-3.5-turbo", "object": "model"}]}


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    r.set(LAST_AUTH_KEY, request.headers.get("authorization", "<missing>"))
    body = await request.json()
    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": body.get("model", "gpt-3.5-turbo"),
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "spike upstream reply"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 42, "completion_tokens": 7, "total_tokens": 49},
    }


@app.post("/v1/messages")
async def anthropic_messages(request: Request):
    r.set(LAST_ANTHROPIC_AUTH_KEY, request.headers.get("x-api-key", "<missing>"))
    body = await request.json()
    return {
        "id": f"msg_{uuid.uuid4().hex[:12]}",
        "type": "message",
        "role": "assistant",
        "model": body.get("model", "claude-3-haiku"),
        "content": [{"type": "text", "text": "spike upstream reply"}],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": 42, "output_tokens": 7},
    }


@app.post("/{path:path}")
async def catch_all(path: str, request: Request):
    # 快速定位 LiteLLM 实际调用的上游路径
    r.set("spike:last_unknown_path", "/" + path)
    return JSONResponse(status_code=404, content={"detail": f"fake_provider: no route /{path}"})
