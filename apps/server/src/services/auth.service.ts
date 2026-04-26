import { HttpError } from '../lib/http-errors';

export const validateSessionRequest = async (userId: string) => {
  // TODO: Replace with real auth integration (JWT introspection / session store lookup).
  if (!userId || userId.length < 3) {
    throw new HttpError(401, 'Invalid caller identity');
  }

  return {
    actorId: userId,
    scopes: ['voice:session:create']
  };
};
