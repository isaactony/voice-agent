import pino from 'pino';

export type Logger = pino.Logger;

export const createLogger = (service: string) =>
  pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', '*.token', '*.apiKey', '*.secret'],
      censor: '[REDACTED]'
    }
  });
