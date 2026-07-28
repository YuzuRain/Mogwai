# mogwai gateway 镜像(architecture A4)。
# 构建上下文必须是仓库根目录:镜像要打包 packages/shared 导出的 JSON Schema 契约工件。
#   docker build -f gateway/Dockerfile .
FROM ghcr.io/berriai/litellm:main-stable

# jsonschema:usage 事件出网关前按契约工件校验(gateway/plugins/usage_publisher.py)
# 基础镜像用 uv 构建、venv 不带 pip,先 ensurepip 再装
RUN /app/.venv/bin/python -m ensurepip --upgrade \
    && /app/.venv/bin/python -m pip install --no-cache-dir jsonschema

COPY gateway/plugins /app/plugins
COPY gateway/litellm-config.yaml /app/config.yaml
# 契约工件来自 `pnpm export:schemas`(packages/shared,随源码提交)
COPY packages/shared/schemas/json /app/schemas

# 插件间以扁平模块名互相导入(litellm 以文件路径加载 callback,不认包结构)
ENV PYTHONPATH=/app/plugins
# usage 事件本地 spool 目录(tech-design §2.3 可靠性)
RUN mkdir -p /var/lib/mogwai

CMD ["--config", "/app/config.yaml", "--port", "4000"]
