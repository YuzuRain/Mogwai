FROM python:3.12-slim
RUN pip install --no-cache-dir redis cryptography
COPY seed.py /srv/seed.py
WORKDIR /srv
CMD ["python", "seed.py"]
