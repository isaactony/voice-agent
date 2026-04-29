import type { Request } from 'express';
import { env } from '../config/env';
import { HttpError } from '../lib/http-errors';
import { redis } from '../db/redis';
import type { CallerIdentity } from './auth.service';

const RATE_LIMIT_PREFIX = 'voice-rate-limit';
const ABUSE_BLOCK_PREFIX = 'voice-abuse-block';
const ABUSE_VIOLATIONS_PREFIX = 'voice-abuse-violations';

const requestIp = (req: Request) =>
  req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown-ip';

const blockedKey = (actorId: string, ip: string) => `${ABUSE_BLOCK_PREFIX}:${actorId}:${ip}`;
const violationsKey = (actorId: string, ip: string) => `${ABUSE_VIOLATIONS_PREFIX}:${actorId}:${ip}`;
const limiterKey = (actorId: string, ip: string) =>
  `${RATE_LIMIT_PREFIX}:session-start:${actorId}:${ip}`;

export const enforceSessionStartGuardrails = async (req: Request, identity: CallerIdentity) => {
  const ip = requestIp(req);

  if (await redis.get(blockedKey(identity.actorId, ip))) {
    throw new HttpError(429, 'Too many abusive requests. Please retry later.');
  }

  const rateKey = limiterKey(identity.actorId, ip);
  const total = await redis.incr(rateKey);
  if (total === 1) {
    await redis.expire(rateKey, env.RATE_LIMIT_WINDOW_SECONDS);
  }

  if (total <= env.RATE_LIMIT_MAX_REQUESTS) {
    return;
  }

  const vKey = violationsKey(identity.actorId, ip);
  const violations = await redis.incr(vKey);
  if (violations === 1) {
    await redis.expire(vKey, env.ABUSE_BLOCK_SECONDS);
  }

  if (violations >= env.ABUSE_MAX_VIOLATIONS) {
    await redis.set(blockedKey(identity.actorId, ip), '1', 'EX', env.ABUSE_BLOCK_SECONDS);
  }

  throw new HttpError(429, 'Rate limit exceeded for session creation');
};
