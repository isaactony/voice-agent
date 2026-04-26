import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { HttpError } from '../lib/http-errors';

export const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Unknown error';

  logger.error({ err: error, requestId: req.requestId, status }, 'request failed');

  res.status(status).json({
    error: message,
    requestId: req.requestId
  });
};
