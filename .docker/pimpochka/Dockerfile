# syntax=docker/dockerfile:1.7
# Build full AFFiNE image from this fork (use in CI, not on a small VPS).
# Requires pre-built artifacts: yarn affine @affine/web build, admin, mobile, server.

FROM node:22-bookworm-slim AS assets
WORKDIR /app

COPY ./packages/backend/server /app
COPY ./packages/frontend/apps/web/dist /app/static
COPY ./packages/frontend/admin/dist /app/static/admin
COPY ./packages/frontend/apps/mobile/dist /app/static/mobile

ARG TARGETARCH
ARG TARGETVARIANT

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl ca-certificates && \
  rm -rf /var/lib/apt/lists/*

RUN AFFINE_DOCKER_CLEAN=1 TARGETARCH="${TARGETARCH}" TARGETVARIANT="${TARGETVARIANT}" node ./scripts/docker-clean.mjs

FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=assets /app /app

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl libjemalloc2 && \
  rm -rf /var/lib/apt/lists/*

ENV LD_PRELOAD=libjemalloc.so.2
ENV AFFINE_SELFHOST_MEMBER_LIMIT=100

EXPOSE 3010

CMD ["node", "./dist/main.js"]
