import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3
});

export const ensureRedis = async () => {
  if (redis.status === 'wait') {
    await redis.connect();
  }
};
