FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/app/backend

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY scripts /app/scripts
RUN chmod +x /app/backend/docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]
