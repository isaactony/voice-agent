import { Router } from 'express';
import { startSessionHandler } from '../controllers/session.controller';

export const sessionRouter = Router();

sessionRouter.post('/start', startSessionHandler);
