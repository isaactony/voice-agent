import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pgPool } from './postgres';

export type SessionRecord = {
  id: string;
  userId: string;
  roomName: string;
  participantIdentity: string;
  status: 'created' | 'active' | 'ended';
};

const withClient = async <T>(fn: (client: PoolClient) => Promise<T>) => {
  const client = await pgPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};

export const createSession = async (input: Omit<SessionRecord, 'id'>): Promise<SessionRecord> => {
  const id = randomUUID();

  await withClient(async (client) => {
    await client.query(
      `INSERT INTO sessions (id, user_id, room_name, participant_identity, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, input.userId, input.roomName, input.participantIdentity, input.status]
    );
  });

  return { id, ...input };
};

export const appendTranscriptEvent = async (params: {
  sessionId: string;
  source: string;
  content: string;
  metadata?: Record<string, unknown>;
}) => {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO transcript_events (id, session_id, source, content, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [randomUUID(), params.sessionId, params.source, params.content, JSON.stringify(params.metadata ?? {})]
    );
  });
};

export const appendToolEvent = async (params: {
  sessionId: string;
  toolName: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  status: 'ok' | 'error';
}) => {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO tool_events (id, session_id, tool_name, request_payload, response_payload, status)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [
        randomUUID(),
        params.sessionId,
        params.toolName,
        JSON.stringify(params.requestPayload),
        JSON.stringify(params.responsePayload ?? {}),
        params.status
      ]
    );
  });
};

export const appendOutcome = async (params: {
  sessionId: string;
  outcomeType: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) => {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO outcomes (id, session_id, outcome_type, summary, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [randomUUID(), params.sessionId, params.outcomeType, params.summary, JSON.stringify(params.metadata ?? {})]
    );
  });
};
