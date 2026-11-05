# -----------------------------------------------------------------------------
# Envoy — build multi-stage Python 3.11
# Stage 1 : installe les dépendances dans un virtualenv isolé
# Stage 2 : image runtime minimale, utilisateur non-root
# -----------------------------------------------------------------------------

FROM python:3.11-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt


FROM python:3.11-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH=/app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 envoy \
    && useradd --uid 1000 --gid envoy --create-home --home-dir /home/envoy \
       --shell /usr/sbin/nologin envoy

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=envoy:envoy app ./app
COPY --chown=envoy:envoy alembic ./alembic
COPY --chown=envoy:envoy alembic.ini ./

USER envoy

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
