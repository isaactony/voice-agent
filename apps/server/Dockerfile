FROM node:20-alpine AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server

RUN npm install --workspaces --include-workspace-root
RUN npm run build -w @voice-agent/config && npm run build -w @voice-agent/shared && npm run build -w @voice-agent/server

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=base /app/package.json ./package.json
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/apps/server/dist ./apps/server/dist

CMD ["node", "apps/server/dist/index.js"]
