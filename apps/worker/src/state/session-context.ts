import { redis } from '../db/redis';

const SESSION_CONTEXT_PREFIX = 'voice-session-context';

export const storeEphemeralContext = async (
  sessionId: string,
  payload: Record<string, unknown>,
  ttlSeconds = 30 * 60
) => {
  await redis.set(`${SESSION_CONTEXT_PREFIX}:${sessionId}`, JSON.stringify(payload), 'EX', ttlSeconds);
};

export const getEphemeralContext = async (
  sessionId: string
): Promise<Record<string, unknown> | null> => {
  const raw = await redis.get(`${SESSION_CONTEXT_PREFIX}:${sessionId}`);
  if (!raw) return null;
  return JSON.parse(raw) as Record<string, unknown>;
};

export const mergeEphemeralContext = async (
  sessionId: string,
  partial: Record<string, unknown>,
  ttlSeconds = 30 * 60
) => {
  const current = (await getEphemeralContext(sessionId)) ?? {};
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  await storeEphemeralContext(sessionId, next, ttlSeconds);
};

export const deleteEphemeralContext = async (sessionId: string) => {
  await redis.del(`${SESSION_CONTEXT_PREFIX}:${sessionId}`);
};
