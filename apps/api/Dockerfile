# Build context is the MONOREPO ROOT, not apps/api - pnpm workspaces need the root
# pnpm-workspace.yaml/pnpm-lock.yaml and packages/shared-types (a workspace:* dependency of
# api) present to resolve correctly. Build from the repo root:
#   docker build -f apps/api/Dockerfile -t link-shortener-api .

FROM node:24-alpine AS base
RUN corepack enable

# ---- deps: install the full workspace once, cached as its own layer keyed on lockfile+manifests ----
FROM base AS deps
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

# ---- build: compile shared-types, generate the Prisma client, build api ----
# Deliberately does NOT try to hand-assemble a slimmed "prod-only" node_modules by copying
# individual pnpm store paths into the runtime image - pnpm's node_modules is a tree of symlinks
# into a shared content-addressed .pnpm store, and copying only some of those paths (skipping
# the top-level symlinks or the generated Prisma client under node_modules/.prisma) silently
# breaks module resolution at runtime rather than failing the build. Ran into exactly that here
# on the first attempt - see git history if reproducing. The whole build-stage node_modules
# (including devDependencies) is copied into the runtime image below instead: a larger image,
# but the tradeoff is a build that's actually correct instead of one that merely looks slim.
FROM deps AS build
WORKDIR /repo
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
RUN pnpm --filter @link-shortener/shared-types build
RUN pnpm --filter api exec prisma generate
RUN pnpm --filter api build

# ---- runtime ----
FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared-types ./packages/shared-types
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main"]
