import { z } from 'zod';
import { loadEnv } from '@voice-agent/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default('info'),
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  LIVEKIT_AGENT_NAME: z.string().default('support-agent'),
  LIVEKIT_TOKEN_TTL_SECONDS: z.coerce.number().default(3600),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url()
});

export const env = loadEnv(envSchema);
