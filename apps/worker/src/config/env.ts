import { z } from 'zod';
import { loadEnv } from '@voice-agent/config';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  LIVEKIT_AGENT_NAME: z.string().default('support-agent'),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime'),
  TURN_DETECTION_MODE: z.enum(['realtime_llm', 'vad', 'stt', 'manual']).default('realtime_llm'),
  TURN_ENDPOINTING_MIN_DELAY_MS: z.coerce.number().default(450),
  TURN_ENDPOINTING_MAX_DELAY_MS: z.coerce.number().default(1800),
  INTERRUPTION_ENABLED: z.coerce.boolean().default(true),
  INTERRUPTION_MODE: z.enum(['adaptive', 'vad']).default('adaptive'),
  INTERRUPTION_MIN_DURATION_MS: z.coerce.number().default(500),
  INTERRUPTION_MIN_WORDS: z.coerce.number().default(0),
  INTERRUPTION_FALSE_TIMEOUT_MS: z.coerce.number().default(2000),
  INTERRUPTION_RESUME_FALSE: z.coerce.boolean().default(true),
  INTERRUPTION_DISCARD_AUDIO_IF_UNINTERRUPTIBLE: z.coerce.boolean().default(true),
  PROACTIVE_UX_ENABLED: z.coerce.boolean().default(true),
  PROACTIVE_IDLE_NUDGE_MS: z.coerce.number().default(12000),
  PROACTIVE_CLARIFICATION_REPROMPT_MS: z.coerce.number().default(4500),
  PROACTIVE_MAX_IDLE_NUDGES: z.coerce.number().default(2),
  CARTESIA_VOICE_ID: z.string().min(1),
  CARTESIA_LANGUAGE: z.string().default('en'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url()
});

export const env = loadEnv(schema);
