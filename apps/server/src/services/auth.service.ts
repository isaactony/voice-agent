import type { Request } from 'express';
import { env } from '../config/env';
import { HttpError } from '../lib/http-errors';
import { introspectAccessToken } from './token-introspection.service';

export type CallerIdentity = {
  actorId: string;
  scopes: string[];
  tokenId: string;
};

const getBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
};

export const requireCallerIdentity = async (req: Request): Promise<CallerIdentity> => {
  if (!env.AUTH_REQUIRED) {
    return {
      actorId: req.body?.userId ?? 'anonymous-dev-user',
      scopes: ['voice:session:create', env.AUTH_OVERRIDE_SCOPE],
      tokenId: 'dev-bypass'
    };
  }

  const token = getBearerToken(req);
  if (!token) throw new HttpError(401, 'Missing bearer token');

  if (env.AUTH_PROVIDER_MODE === 'introspection') {
    try {
      const identity = await introspectAccessToken(token);
      return identity;
    } catch (error) {
      if (!env.AUTH_INTROSPECTION_STATIC_FALLBACK) {
        throw error;
      }
    }
  }

  const entry = env.AUTH_BEARER_TOKENS_JSON[token];
  if (!entry) throw new HttpError(401, 'Invalid bearer token');

  return {
    actorId: entry.actorId,
    scopes: entry.scopes,
    tokenId: token.slice(0, 8)
  };
};

export const validateSessionRequest = async (identity: CallerIdentity, userId: string) => {
  if (!userId || userId.length < 3) {
    throw new HttpError(400, 'Invalid requested userId');
  }

  const hasCreateScope = identity.scopes.includes('voice:session:create');
  const canOverrideIdentity = identity.scopes.includes(env.AUTH_OVERRIDE_SCOPE);
  if (!hasCreateScope) {
    throw new HttpError(403, 'Missing scope: voice:session:create');
  }

  if (!canOverrideIdentity && identity.actorId !== userId) {
    throw new HttpError(403, 'Caller is not allowed to create sessions for other users');
  }

  return identity;
};
