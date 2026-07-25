#!/usr/bin/env bash
# End-to-end assertions for the LiteLLM spike. Run after: docker-compose up -d --build
set -u
cd "$(dirname "$0")"

BASE="http://localhost:4000"
TOKEN="sk_spike_platform_token_001"
EXPECTED_UPSTREAM_AUTH="Bearer sk-fake-openai-key-A1B2C3"

COMPOSE="docker-compose"
command -v docker-compose >/dev/null 2>&1 || COMPOSE="docker compose"

pass=0; fail=0
check() { # $1 = description, $2 = 0/1 result (0 = ok)
  if [ "$2" -eq 0 ]; then echo "PASS  $1"; pass=$((pass+1));
  else echo "FAIL  $1"; fail=$((fail+1)); fi
}

# 1. custom_auth: valid platform token accepted, request served (OpenAI wire format)
resp=$(curl -s -w '\n%{http_code}' "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"model":"openai/gpt-3.5-turbo","messages":[{"role":"user","content":"ping"}]}')
code=$(echo "$resp" | tail -1); body=$(echo "$resp" | sed '$d')
[ "$code" = "200" ] && echo "$body" | grep -q "spike upstream reply"
check "OpenAI endpoint: valid token -> 200 with upstream content" $?

# 2. custom_auth: unknown token rejected
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/chat/completions" \
  -H "Authorization: Bearer sk_wrong_token" -H 'Content-Type: application/json' \
  -d '{"model":"openai/gpt-3.5-turbo","messages":[{"role":"user","content":"ping"}]}')
[ "$code" = "401" ]
check "OpenAI endpoint: unknown token -> 401 (got $code)" $?

# 3. key_resolver: upstream received the DECRYPTED byok key, not the placeholder
got_auth=$($COMPOSE exec -T redis redis-cli GET spike:last_provider_auth)
[ "$got_auth" = "$EXPECTED_UPSTREAM_AUTH" ]
check "key injection: upstream saw decrypted BYOK key (got: $got_auth)" $?

# 4. usage_publisher: usage.completed event landed in Redis Streams with schema fields
entry=$($COMPOSE exec -T redis redis-cli XRANGE events:usage.completed - + COUNT 1)
echo "$entry" | grep -q 'u_spike_1' \
  && echo "$entry" | grep -q 'input_tokens' \
  && echo "$entry" | grep -q 'event_id' \
  && echo "$entry" | grep -q 'schema_version'
check "usage.completed event in stream with user_id/tokens/event_id" $?

# 5. Anthropic wire format: /v1/messages + anthropic provider (Claude Code path)
resp=$(curl -s -w '\n%{http_code}' "$BASE/v1/messages" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"model":"anthropic/claude-3-haiku","max_tokens":128,"messages":[{"role":"user","content":"ping"}]}')
code=$(echo "$resp" | tail -1); body=$(echo "$resp" | sed '$d')
[ "$code" = "200" ] && echo "$body" | grep -q "spike upstream reply"
check "Anthropic /v1/messages: valid token -> 200 with upstream content" $?

# 6. key_resolver on anthropic route: upstream saw the decrypted anthropic key
got_auth=$($COMPOSE exec -T redis redis-cli GET spike:last_anthropic_auth)
[ "$got_auth" = "sk-fake-anthropic-key-D4E5F6" ]
check "key injection (anthropic): upstream saw decrypted key (got: $got_auth)" $?

echo
echo "== $pass passed, $fail failed =="
exit $((fail > 0))
