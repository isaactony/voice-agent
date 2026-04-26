FROM node:20-alpine AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

RUN npm install --workspaces --include-workspace-root
RUN npm run build -w @voice-agent/config && npm run build -w @voice-agent/shared && npm run build -w @voice-agent/worker

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/worker/dist ./apps/worker/dist

CMD ["node", "apps/worker/dist/index.js", "start"]
