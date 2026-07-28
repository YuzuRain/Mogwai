#!/usr/bin/env bash
# gateway 集成测试入口:构建全部镜像,起真实依赖,跑 pytest,清理。
set -u
cd "$(dirname "$0")"

COMPOSE="docker-compose"
command -v docker-compose >/dev/null 2>&1 || COMPOSE="docker compose"

$COMPOSE -f docker-compose.test.yml up -d --build redis fake-provider litellm || exit 1
$COMPOSE -f docker-compose.test.yml run --build --rm tests
code=$?
$COMPOSE -f docker-compose.test.yml down -v
exit $code
