# Mintboard on Fly.
#
# Multi-stage so the shipped image carries the built server and nothing that
# built it — no source, no dev dependencies, no package manager.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# npm ci, not install: the lockfile is the build input, and an install that
# quietly resolves a different tree is how a container stops matching the repo.
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
# Never run as root. Nothing here needs it.
RUN addgroup -g 1001 -S nodejs && adduser -S next -u 1001
COPY --from=build --chown=next:nodejs /app/.next/standalone ./
COPY --from=build --chown=next:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=next:nodejs /app/public ./public
USER next
EXPOSE 8080
CMD ["node", "server.js"]
