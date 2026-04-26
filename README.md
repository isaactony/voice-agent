# How to build a production-ready voice agent platform with LiveKit, OpenAI Realtime, Cartesia, and Node.js

This repository is a production-oriented TypeScript monorepo for a real-time voice agent platform.

It uses:
- LiveKit for WebRTC transport, room orchestration, and agent dispatch
- LiveKit React + Agents UI for the web voice frontend
- LiveKit Agents JS SDK for backend agent runtime
- OpenAI Realtime for low-latency understanding and response generation
- Cartesia Sonic-3 as the final speech synthesis layer
- Express API for session bootstrap and token minting
- PostgreSQL for persistent conversation and tool telemetry
- Redis for ephemeral session/runtime context

## Core Architecture

This project uses a **half-cascade architecture**.

What that means:
- We do **not** run a manual full `STT -> LLM -> TTS` pipeline in app code.
- We do **not** let OpenAI Realtime output final audio.
- OpenAI Realtime is configured in **text-only mode** (`modalities: ['text']`).
- Cartesia Sonic-3 is the dedicated final TTS layer.

This gives us low-latency conversational intelligence plus independent voice control.

## Architecture Diagram

```mermaid
flowchart LR
    Browser[Frontend\nNext.js + LiveKit React + Agents UI] -->|POST /session/start| API[Express API]
    API -->|JWT + room config + agent dispatch| LK[(LiveKit Cloud)]
    Browser -->|WebRTC join| LK
    LK -->|dispatch job| Worker[LiveKit Agents Worker\nNode.js + TS]
    Worker -->|text-in/text-out realtime reasoning| OAI[OpenAI Realtime\nmodalities: text]
    Worker -->|final speech synthesis| CART[Cartesia Sonic-3]
    Worker -->|publish audio track| LK
    LK -->|agent audio stream| Browser
    API --> PG[(PostgreSQL)]
    Worker --> PG
    API --> REDIS[(Redis)]
    Worker --> REDIS
```

## Monorepo Structure

```text
voice-agent-platform/
  apps/
    frontend/   # Next.js voice UI (LiveKit starter-style + Agents UI)
    server/     # Express API for health + session start + token minting
    worker/     # LiveKit Agents JS worker (OpenAI Realtime + Cartesia + tools)
  packages/
    shared/     # Shared contracts/types/utilities
    config/     # Shared config helpers
```

## Feature Set

### Voice + Session UX (Frontend)
- Connect/disconnect controls
- Microphone controls
- Agent audio playback via room audio renderer
- Live transcript UI
- Explicit state panel: `connecting`, `listening`, `thinking`, `speaking`, `error`
- Audio visualizer components
- Session start flow backed by API token service (not sandbox-only)

### API Control Plane (Server)
- `GET /health`
- `POST /session/start`
- LiveKit participant token minting via server SDK
- Agent dispatch metadata embedded in token room configuration
- Structured logging + request IDs
- Session persistence bootstrap

### Agent Runtime (Worker)
- LiveKit worker entry via `defineAgent(...)` + `cli.runApp(...)`
- Agent joins dispatched rooms as agent participant
- OpenAI Realtime model integration in text-only mode
- Cartesia Sonic-3 synthesis as separate TTS
- Turn-taking and interruption tuning
- Tool calling with Zod-validated inputs
- Persistence hooks for transcripts, tool events, and outcomes

### Data + State
- PostgreSQL tables:
  - `sessions`
  - `transcript_events`
  - `tool_events`
  - `outcomes`
- Redis for ephemeral workflow/session context

### Observability
- Structured logs across frontend/server/worker
- Worker event logs for user/agent state transitions
- Tool invocation/result logging
- TODO hooks for latency and TTS timing metrics

## Stack Used (Service by Service)

### Frontend (`apps/frontend`)
- Next.js (React + TypeScript)
- `livekit-client`
- `@livekit/components-react`
- Agents UI starter components (control bar, transcript, visualizers)

Key files:
- `apps/frontend/components/app/app.tsx`
- `apps/frontend/components/app/view-controller.tsx`
- `apps/frontend/components/agents-ui/agent-session-provider.tsx`
- `apps/frontend/components/agents-ui/agent-state-panel.tsx`

### Server (`apps/server`)
- Express + TypeScript
- `livekit-server-sdk`
- `@livekit/protocol` for room dispatch config
- `pg` + `ioredis`
- `zod` for payload/config validation

Key files:
- `apps/server/src/controllers/session.controller.ts`
- `apps/server/src/services/livekit.service.ts`
- `apps/server/src/routes/session.routes.ts`

### Worker (`apps/worker`)
- `@livekit/agents`
- `@livekit/agents-plugin-openai`
- `openai.realtime.RealtimeModel(...)`
- `inference.TTS({ model: 'cartesia/sonic-3', ... })`
- Zod-validated tool interfaces
- `pg` + `ioredis`

Key files:
- `apps/worker/src/index.ts`
- `apps/worker/src/agent/entry.ts`
- `apps/worker/src/tools/check-availability.tool.ts`

## End-to-End Request Flow

1. User opens frontend and clicks start/connect.
2. Frontend calls `POST /session/start` on the server.
3. Server validates payload and creates/updates session records.
4. Server mints LiveKit access token and embeds room dispatch metadata (`agentName`).
5. Frontend receives `{ token, livekitUrl, roomName, sessionId, ... }`.
6. Frontend joins LiveKit room over WebRTC.
7. LiveKit dispatches a job to the registered worker.
8. Worker joins the room as the agent participant.
9. Worker starts `AgentSession` with:
   - OpenAI Realtime (text-only)
   - Cartesia Sonic-3 TTS
10. User speaks, agent reasons in realtime, agent audio is synthesized by Cartesia.
11. Agent audio is published to the room and played in the browser.
12. Session/transcript/tool/outcome events are written to Postgres; runtime context to Redis.

## General Voice Agent Behavior

The current assistant instructions are configured as a **general-purpose voice assistant**:
- broad question answering and task help
- concise and practical responses
- interruption-aware behavior
- tool usage only when it adds value

Appointment tooling remains available as an optional capability.

## Local Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- LiveKit Cloud project
- OpenAI API key

### 1) Configure env files

```bash
cp apps/server/.env.example apps/server/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Minimum required variables:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_AGENT_NAME` (server and worker must match)
- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL` (example: `gpt-realtime`)
- `DATABASE_URL`
- `REDIS_URL`
- `NEXT_PUBLIC_API_BASE_URL`

### 2) Install dependencies

```bash
npm install
```

### 3) Start Postgres + Redis (example with Homebrew)

```bash
brew services start postgresql@14
brew services start redis
```

### 4) Apply DB schema

```bash
psql "postgres://postgres:postgres@localhost:5432/voice_agent" -f apps/server/src/db/schema.sql
```

### 5) Run all services

```bash
npm run dev
```

Expected local endpoints:
- Frontend: `http://localhost:3000`
- API: `http://localhost:4000`

## Quick Live Check

1. Boot stack and confirm worker shows `registered worker`.
2. Trigger API session bootstrap:

```bash
curl -s -X POST http://localhost:4000/session/start \
  -H 'content-type: application/json' \
  -d '{"userId":"livecheck-user","channel":"web","context":{"timezone":"Africa/Nairobi","locale":"en-US"}}'
```

3. Open frontend, start conversation, and verify logs:
- API: session started
- Worker: job received + joined room
- Frontend: state transitions + transcript updates

## Turn-Taking and Interruption Tuning

Worker supports configurable turn settings via env:
- `TURN_DETECTION_MODE`
- `TURN_ENDPOINTING_MIN_DELAY_MS`
- `TURN_ENDPOINTING_MAX_DELAY_MS`
- `INTERRUPTION_ENABLED`
- `INTERRUPTION_MODE`
- `INTERRUPTION_MIN_DURATION_MS`
- `INTERRUPTION_MIN_WORDS`
- `INTERRUPTION_FALSE_TIMEOUT_MS`
- `INTERRUPTION_RESUME_FALSE`
- `INTERRUPTION_DISCARD_AUDIO_IF_UNINTERRUPTIBLE`
- `PROACTIVE_UX_ENABLED`
- `PROACTIVE_IDLE_NUDGE_MS`
- `PROACTIVE_CLARIFICATION_REPROMPT_MS`
- `PROACTIVE_MAX_IDLE_NUDGES`

Use these to reduce false interruptions and improve barge-in quality.

## Deployment Notes

Services are deployable independently:
- Frontend app
- API server
- Worker service

Included Dockerfiles:
- `apps/server/Dockerfile`
- `apps/worker/Dockerfile`

Recommended production setup:
- managed Postgres + Redis
- secret manager for all keys
- auth + rate limiting on `/session/start`
- centralized logs and traces

## Troubleshooting

### "Agent did not join the room"
Check in order:
1. Worker process is running and registered.
2. `LIVEKIT_AGENT_NAME` matches in:
   - `apps/server/.env`
   - `apps/worker/.env`
3. Worker logs show `received job request` and then `worker joined room`.
4. Worker did not crash in entry (look for `error in entry function`).

### TTS websocket parsing errors
This project includes a worker postinstall compatibility patch to tolerate unknown non-critical TTS event types until upstream protocol alignment.

### Postgres connection refused
Database is not running or wrong `DATABASE_URL`.

### Redis connection errors
Redis is not running or wrong `REDIS_URL`.

## Credentials and External Setup Still Required

To run locally, you still need real external setup for:
- LiveKit Cloud project + API key/secret
- OpenAI API key with Realtime access
- Running PostgreSQL instance
- Running Redis instance

## Technical Article Angle (Suggested)

If you are writing an article, this repo supports a strong narrative:
1. Why half-cascade voice architecture
2. Real-time media transport with LiveKit
3. Control plane vs runtime plane separation
4. OpenAI Realtime in text-only mode
5. Cartesia as dedicated voice layer
6. Tooling + persistence for production observability
7. Turn-taking and interruption tuning in practice
8. Deployment and hardening checklist

---

If you want, I can also generate a publish-ready `docs/article-draft.md` with section prose, code snippets, and diagram callouts derived from this README.
