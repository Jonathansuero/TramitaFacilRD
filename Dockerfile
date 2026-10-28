# TramitaFácil RD en un contenedor (para servidores que ya usan Docker + nginx-proxy)
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TF_DB_PATH=/datos/tramitafacil.db
WORKDIR /app
RUN pip install --no-cache-dir "Flask>=3.0,<4" "gunicorn>=22.0" \
 && useradd --system --uid 10001 tramita && mkdir -p /datos && chown tramita /datos
COPY --chown=tramita . /app
USER tramita
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/api/salud',timeout=4)"
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--bind", "0.0.0.0:8000", "--access-logfile", "-", "app:app"]
