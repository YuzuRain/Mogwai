FROM python:3.12-slim
COPY requirements.txt /srv/requirements.txt
RUN pip install --no-cache-dir -r /srv/requirements.txt
COPY conftest.py test_gateway.py test_spool.py /srv/
WORKDIR /srv
CMD ["pytest", "-v", "--tb=short"]
