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
