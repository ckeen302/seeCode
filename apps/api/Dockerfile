# SeeCode API image (Section 22.4). Build from the repo root so content/ is included:
#   docker build -f apps/api/Dockerfile -t seecode-api .

# ---- build: resolve the locked dependencies into /srv/venv with uv
FROM python:3.12-slim AS build

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_CACHE=1 \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/srv/venv

RUN pip install --no-cache-dir uv==0.12.21

WORKDIR /srv/apps/api

# Dependencies first, so code changes don't reinstall them.
COPY apps/api/pyproject.toml apps/api/uv.lock apps/api/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY apps/api/ ./
RUN uv sync --frozen --no-dev

# ---- runtime: the venv, the code and the content; no uv, no caches
FROM python:3.12-slim

COPY --from=build /srv/venv /srv/venv
COPY --from=build /srv/apps/api /srv/apps/api
# Content ships inside the image (Section 13.1).
COPY content/ /srv/content/

# ENV defaults to production so a forgotten variable can never enable the dev login.
# FORWARDED_ALLOW_IPS lets --proxy-headers trust the host's load balancer, so rate
# limits see real client IPs.
ENV PATH="/srv/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENV=production \
    PORT=8000 \
    FORWARDED_ALLOW_IPS="*"

WORKDIR /srv/apps/api
RUN useradd --create-home --uid 10001 seecode
USER seecode

EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers"]
