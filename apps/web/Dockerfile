# Build context is the MONOREPO ROOT, not apps/web - pnpm workspaces need the root
# pnpm-workspace.yaml/pnpm-lock.yaml and packages/shared-types (a workspace:* dependency of
# web) present to resolve correctly. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t link-shortener-web .

FROM node:24-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /repo
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
RUN pnpm --filter @link-shortener/shared-types build
RUN pnpm --filter web build

# ---- runtime: static files behind nginx, /api/* reverse-proxied to the backend ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# nginx:alpine's own entrypoint envsubst's *.template files under /etc/nginx/templates/ into
# /etc/nginx/conf.d/ at container start (built into the base image, no custom ENTRYPOINT
# needed here) - only ${API_UPSTREAM_URL} is a real env var in the template; nginx's own
# variables ($host, $remote_addr, ...) intentionally have no braces, so envsubst never touches them.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM_URL=http://api:4000

EXPOSE 8080
