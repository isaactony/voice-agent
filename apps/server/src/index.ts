import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { logger } from './lib/logger';
import { requestIdMiddleware } from './middleware/request-id';
import { errorHandler } from './middleware/error-handler';
import { sessionRouter } from './routes/session.routes';
import { connectRedis } from './services/session-state.service';
import { pgPool } from './db/postgres';

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(requestIdMiddleware);

app.get('/health', async (_req, res) => {
  const db = await pgPool.query('SELECT 1 as ok');
  res.status(200).json({ ok: db.rows[0]?.ok === 1, service: 'voice-agent-server' });
});

app.use('/session', sessionRouter);
app.use(errorHandler);

const boot = async () => {
  await connectRedis();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'server listening');
  });
};

boot().catch((error) => {
  logger.fatal({ err: error }, 'failed to boot server');
  process.exit(1);
});
