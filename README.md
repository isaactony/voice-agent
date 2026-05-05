# Voice Agent Platform

Production-style TypeScript monorepo for a real-time voice agent using LiveKit, OpenAI Realtime, and Cartesia.

## Demo

![Voice Agent Demo](docs/demo.gif)

> Add your short walkthrough GIF at `docs/demo.gif` (5-15 seconds recommended).

## Features

- Real-time browser voice sessions (LiveKit WebRTC)
- Backend session bootstrap + LiveKit token minting
- LiveKit Agents JS worker runtime
- OpenAI Realtime configured in text-only mode
- Cartesia Sonic-3 as dedicated TTS layer
- Example backend tool (`checkAvailability`)
- PostgreSQL persistence for sessions/transcripts/tools/outcomes
- Redis ephemeral session/workflow state
- Proactive UX (silence nudges + clarification reprompts)
- Turn-taking and interruption tuning

## Tech Stack

- Frontend: Next.js + React + TypeScript + LiveKit React Components
- Server: Node.js + Express + TypeScript
- Worker: Node.js + TypeScript + `@livekit/agents`
- Model: OpenAI Realtime (`@livekit/agents-plugin-openai`)
- TTS: Cartesia Sonic-3 via LiveKit inference TTS
- Data: PostgreSQL + Redis

## Monorepo Structure

```text
voice-agent-platform/
  apps/
    frontend/
    server/
    worker/
  packages/
    shared/
    config/
```

## Architecture (High Level)

1. Frontend calls `POST /session/start` on server.
2. Server creates session, stores initial state, mints LiveKit token.
3. Frontend joins LiveKit room using returned `livekitUrl + token`.
4. LiveKit dispatches worker into room (`agentName`).
5. Worker starts `AgentSession` with:
   - OpenAI Realtime (text-only)
   - Cartesia Sonic-3 (final speech)
6. Worker publishes agent audio back to room for frontend playback.
7. Session/tool/transcript/outcome events persist in Postgres; ephemeral state in Redis.

---

## Quick Start

### 1) Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 14+
- Redis 7+
- LiveKit Cloud project
- OpenAI API key
- Cartesia voice configuration

### 2) Clone and install

```bash
git clone <your-repo-url>
cd voice-agent-platform
npm install
```

### 3) Configure environment files

```bash
cp apps/server/.env.example apps/server/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Fill required values:

- Server (`apps/server/.env`)
  - `LIVEKIT_URL`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
  - `LIVEKIT_AGENT_NAME`
  - `DATABASE_URL`
  - `REDIS_URL`
  - Auth settings (`AUTH_*`)

- Worker (`apps/worker/.env`)
  - `LIVEKIT_URL`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
  - `LIVEKIT_AGENT_NAME`
  - `OPENAI_API_KEY`
  - `OPENAI_REALTIME_MODEL`
  - `CARTESIA_VOICE_ID`
  - `CARTESIA_LANGUAGE`
  - `DATABASE_URL`
  - `REDIS_URL`

- Frontend (`apps/frontend/.env`)
  - `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:4000`)
  - `NEXT_PUBLIC_SESSION_BEARER_TOKEN` (if auth is enabled)

### 4) Start Postgres and Redis

Example (Homebrew):

```bash
brew services start postgresql@14
brew services start redis
```

### 5) Apply database schema

```bash
psql "postgres://postgres:postgres@localhost:5432/voice_agent" -f apps/server/src/db/schema.sql
```

### 6) Run the full stack

```bash
npm run dev
```

Expected endpoints:

- Frontend: `http://localhost:3000`
- Server: `http://localhost:4000`

---

## Authentication Modes (`/session/start`)

Configured in `apps/server/.env`:

- `AUTH_PROVIDER_MODE=static`
  - Uses `AUTH_BEARER_TOKENS_JSON` map
- `AUTH_PROVIDER_MODE=introspection`
  - Validates bearer token against provider endpoint
  - Supports `AUTH_INTROSPECTION_MODE=oauth2|userinfo`

For Supabase, use:

- `AUTH_PROVIDER_MODE=introspection`
- `AUTH_INTROSPECTION_MODE=userinfo`
- `AUTH_INTROSPECTION_URL=https://<project-ref>.supabase.co/auth/v1/user`

---

## Useful Scripts

From repo root:

- `npm run dev` – run frontend + server + worker
- `npm run build` – build all workspaces
- `npm run typecheck` – typecheck all workspaces

Workspace examples:

- `npm run dev -w @voice-agent/frontend`
- `npm run dev -w @voice-agent/server`
- `npm run dev -w @voice-agent/worker`

---

## Troubleshooting

### Agent did not join the room

- Ensure worker is running and registered
- Ensure `LIVEKIT_AGENT_NAME` matches in server + worker env
- Check worker logs for `received job request` / `worker joined room`

### Session start returns 401/403

- Missing/invalid bearer token
- Caller scope missing `voice:session:create`
- Caller trying to create session for different `userId` without override scope

### Session start returns 429

- Rate limit or abuse block triggered
- Check `RATE_LIMIT_*` and `ABUSE_*` env values

### Postgres/Redis connection errors

- Verify services are running
- Verify `DATABASE_URL` and `REDIS_URL`

---

## Deployment Notes

Services are designed for independent deployment:

- Frontend app
- API server
- Worker runtime

Included Dockerfiles:

- `apps/server/Dockerfile`
- `apps/worker/Dockerfile`

Recommended production hardening:

- Use managed secrets (do not commit `.env`)
- Replace static auth with provider introspection/JWT verification
- Add metrics/tracing pipeline (latency, errors, tool failures)
- Add rate limits at edge/API gateway level

---

## Security

- Rotate any keys that were ever shared publicly.
- Keep `.env` files out of Git.
- Grant minimum required scopes for auth tokens.

## License

Private/internal by default. Add a license file if open-sourcing.
