import { redis } from '../db/redis';

const SESSION_STATE_PREFIX = 'voice-session-state';

export const connectRedis = async () => {
  if (redis.status === 'wait') {
    await redis.connect();
  }
};

export const writeSessionState = async (
  sessionId: string,
  state: Record<string, unknown>,
  ttlSeconds = 60 * 60
) => {
  await redis.set(`${SESSION_STATE_PREFIX}:${sessionId}`, JSON.stringify(state), 'EX', ttlSeconds);
};

export const readSessionState = async (
  sessionId: string
): Promise<Record<string, unknown> | null> => {
  const raw = await redis.get(`${SESSION_STATE_PREFIX}:${sessionId}`);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
};

export const mergeSessionState = async (
  sessionId: string,
  partial: Record<string, unknown>,
  ttlSeconds = 60 * 60
) => {
  const current = (await readSessionState(sessionId)) ?? {};
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  await writeSessionState(sessionId, next, ttlSeconds);
};

export const deleteSessionState = async (sessionId: string) => {
  await redis.del(`${SESSION_STATE_PREFIX}:${sessionId}`);
};
