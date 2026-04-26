import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

export const requestIdMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  req.requestId = req.headers['x-request-id']?.toString() ?? randomUUID();
  next();
};
