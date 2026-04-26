import { redis } from '../db/redis';

const SESSION_CONTEXT_PREFIX = 'voice-session-context';

export const storeEphemeralContext = async (
  sessionId: string,
  payload: Record<string, unknown>,
  ttlSeconds = 30 * 60
) => {
  await redis.set(`${SESSION_CONTEXT_PREFIX}:${sessionId}`, JSON.stringify(payload), 'EX', ttlSeconds);
};
