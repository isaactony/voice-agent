import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { HttpError } from '../lib/http-errors';

type IntrospectionIdentity = {
  actorId: string;
  scopes: string[];
  tokenId: string;
};

const fingerprintToken = (token: string) =>
  createHash('sha256').update(token).digest('hex').slice(0, 12);

const normalizeScopes = (raw: unknown): string[] => {
  if (typeof raw === 'string') {
    return raw
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }

  return [];
};

const extractScopes = (payload: Record<string, unknown>): string[] => {
  const fromPrimary = normalizeScopes(payload[env.AUTH_INTROSPECTION_SCOPE_CLAIM]);
  if (fromPrimary.length > 0) return fromPrimary;

  const fromScope = normalizeScopes(payload.scope);
  if (fromScope.length > 0) return fromScope;

  const fromScp = normalizeScopes(payload.scp);
  if (fromScp.length > 0) return fromScp;

  const fromPermissions = normalizeScopes(payload.permissions);
  if (fromPermissions.length > 0) return fromPermissions;

  return env.AUTH_INTROSPECTION_DEFAULT_SCOPES;
};

const readSubject = (payload: Record<string, unknown>): string | null => {
  const candidate = payload[env.AUTH_INTROSPECTION_SUBJECT_CLAIM];
  if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;

  const fallback = payload.sub;
  if (typeof fallback === 'string' && fallback.trim().length > 0) return fallback;

  return null;
};

const withTimeout = (timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeout };
};

const introspectOAuth2 = async (token: string): Promise<IntrospectionIdentity> => {
  if (!env.AUTH_INTROSPECTION_URL) {
    throw new HttpError(500, 'AUTH_INTROSPECTION_URL is required in introspection mode');
  }

  const { controller, timeout } = withTimeout(env.AUTH_INTROSPECTION_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({
      token,
      token_type_hint: 'access_token'
    });

    if (env.AUTH_INTROSPECTION_AUDIENCE) {
      body.set('audience', env.AUTH_INTROSPECTION_AUDIENCE);
    }

    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded'
    };

    if (env.AUTH_INTROSPECTION_CLIENT_ID && env.AUTH_INTROSPECTION_CLIENT_SECRET) {
      const basic = Buffer.from(
        `${env.AUTH_INTROSPECTION_CLIENT_ID}:${env.AUTH_INTROSPECTION_CLIENT_SECRET}`
      ).toString('base64');
      headers.authorization = `Basic ${basic}`;
    } else if (env.AUTH_INTROSPECTION_CLIENT_ID) {
      body.set('client_id', env.AUTH_INTROSPECTION_CLIENT_ID);
      if (env.AUTH_INTROSPECTION_CLIENT_SECRET) {
        body.set('client_secret', env.AUTH_INTROSPECTION_CLIENT_SECRET);
      }
    }

    const response = await fetch(env.AUTH_INTROSPECTION_URL, {
      method: 'POST',
      headers,
      body: body.toString(),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new HttpError(401, `Token introspection failed (${response.status})`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const active = payload.active;
    if (active === false) {
      throw new HttpError(401, 'Access token is inactive');
    }

    const actorId = readSubject(payload);
    if (!actorId) {
      throw new HttpError(401, 'Token subject missing in introspection response');
    }

    return {
      actorId,
      scopes: extractScopes(payload),
      tokenId: fingerprintToken(token)
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'Token introspection request failed');
  } finally {
    clearTimeout(timeout);
  }
};

const introspectUserInfo = async (token: string): Promise<IntrospectionIdentity> => {
  if (!env.AUTH_INTROSPECTION_URL) {
    throw new HttpError(500, 'AUTH_INTROSPECTION_URL is required in introspection mode');
  }

  const { controller, timeout } = withTimeout(env.AUTH_INTROSPECTION_TIMEOUT_MS);
  try {
    const response = await fetch(env.AUTH_INTROSPECTION_URL, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new HttpError(401, `Token userinfo request failed (${response.status})`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const actorId = readSubject(payload);
    if (!actorId) {
      throw new HttpError(401, 'Token subject missing in userinfo response');
    }

    return {
      actorId,
      scopes: extractScopes(payload),
      tokenId: fingerprintToken(token)
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'Token userinfo request failed');
  } finally {
    clearTimeout(timeout);
  }
};

export const introspectAccessToken = async (token: string): Promise<IntrospectionIdentity> => {
  if (env.AUTH_INTROSPECTION_MODE === 'userinfo') {
    return introspectUserInfo(token);
  }
  return introspectOAuth2(token);
};
