import type { Request, Response } from 'express';
import {
  startSessionRequestSchema,
  startSessionResponseSchema,
  type StartSessionRequest
} from '@voice-agent/shared';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { validateSessionRequest } from '../services/auth.service';
import { mintParticipantToken } from '../services/livekit.service';
import { createSession } from '../db/session-repository';
import { writeSessionState } from '../services/session-state.service';

const buildRoomName = (userId: string) => `voice-${userId}-${Date.now()}`;

export const startSessionHandler = async (req: Request, res: Response) => {
  const payload = startSessionRequestSchema.parse(req.body) as StartSessionRequest;

  await validateSessionRequest(payload.userId);

  const participantIdentity = `user-${payload.userId}`;
  const roomName = buildRoomName(payload.userId);
  const session = await createSession({
    userId: payload.userId,
    roomName,
    participantIdentity,
    status: 'created'
  });

  const token = await mintParticipantToken({ roomName, participantIdentity });

  await writeSessionState(session.id, {
    roomName,
    participantIdentity,
    requestId: req.requestId,
    startedAt: new Date().toISOString(),
    context: payload.context ?? {}
  });

  logger.info(
    {
      requestId: req.requestId,
      sessionId: session.id,
      roomName,
      userId: payload.userId
    },
    'session started'
  );

  const response = startSessionResponseSchema.parse({
    sessionId: session.id,
    roomName,
    token,
    livekitUrl: env.LIVEKIT_URL,
    expiresAt: new Date(Date.now() + env.LIVEKIT_TOKEN_TTL_SECONDS * 1000).toISOString()
  });

  res.status(201).json(response);
};
