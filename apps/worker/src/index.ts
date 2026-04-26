import { WorkerOptions, cli } from '@livekit/agents';
import { fileURLToPath } from 'node:url';
import { env } from './config/env';
import { logger } from './observability/logger';
import { ensureRedis } from './db/redis';
import { pool } from './db/postgres';

const run = async () => {
  await ensureRedis();
  await pool.query('SELECT 1');
  const agentEntryRelativePath = import.meta.url.endsWith('.ts') ? './agent/entry.ts' : './agent/entry.js';

  const opts = new WorkerOptions({
    agent: fileURLToPath(new URL(agentEntryRelativePath, import.meta.url)),
    wsURL: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    agentName: env.LIVEKIT_AGENT_NAME,
    production: env.NODE_ENV === 'production',
    logLevel: env.LOG_LEVEL
  });

  cli.runApp(opts);
};

run().catch((error) => {
  logger.fatal({ err: error }, 'worker boot failed');
  process.exit(1);
});
