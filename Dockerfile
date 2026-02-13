FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS prod-dependencies

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

FROM base AS build

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN pnpm prisma:generate
RUN pnpm build

FROM base AS runtime

ARG GIT_COMMIT
ENV GIT_COMMIT=${GIT_COMMIT}
ENV NODE_ENV=production

# All environment variables are set at runtime, not build time
# ENVIRONMENT and other env vars will be provided via docker-compose or k8s

COPY --from=prod-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/package.json ./package.json
COPY prisma ./prisma

# creds.json is NOT included in the image - it must be mounted at runtime
# For docker-compose: mounted as volume
# For Kubernetes: mounted as secret

EXPOSE 3000

USER node

CMD ["node", "dist/index.js"]
