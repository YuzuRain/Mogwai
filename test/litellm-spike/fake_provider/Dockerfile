FROM python:3.12-slim
RUN pip install --no-cache-dir fastapi uvicorn redis
COPY main.py /srv/main.py
WORKDIR /srv
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
