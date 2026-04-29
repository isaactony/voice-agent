import { randomUUID } from 'node:crypto';
import { pool } from './postgres';

export const findSessionIdByRoomName = async (roomName: string): Promise<string | null> => {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM sessions
     WHERE room_name = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [roomName]
  );

  return result.rows[0]?.id ?? null;
};

export const writeTranscriptEvent = async (params: {
  sessionId: string;
  source: string;
  content: string;
  metadata?: Record<string, unknown>;
}) => {
  await pool.query(
    `INSERT INTO transcript_events (id, session_id, source, content, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [randomUUID(), params.sessionId, params.source, params.content, JSON.stringify(params.metadata ?? {})]
  );
};

export const writeToolEvent = async (params: {
  sessionId: string;
  toolName: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  status: 'ok' | 'error';
}) => {
  await pool.query(
    `INSERT INTO tool_events (id, session_id, tool_name, request_payload, response_payload, status)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
    [
      randomUUID(),
      params.sessionId,
      params.toolName,
      JSON.stringify(params.requestPayload),
      JSON.stringify(params.responsePayload),
      params.status
    ]
  );
};

export const writeOutcome = async (params: {
  sessionId: string;
  outcomeType: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) => {
  await pool.query(
    `INSERT INTO outcomes (id, session_id, outcome_type, summary, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [randomUUID(), params.sessionId, params.outcomeType, params.summary, JSON.stringify(params.metadata ?? {})]
  );
};

export const updateSessionStatus = async (
  sessionId: string,
  status: 'active' | 'ended',
  endedAt?: string
) => {
  await pool.query(
    `UPDATE sessions
     SET status = $2,
         updated_at = NOW(),
         ended_at = CASE
           WHEN $2 = 'ended' THEN COALESCE($3::timestamptz, NOW())
           ELSE ended_at
         END
     WHERE id = $1`,
    [sessionId, status, endedAt ?? null]
  );
};
