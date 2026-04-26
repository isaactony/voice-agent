import { AccessToken, type VideoGrant } from 'livekit-server-sdk';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { env } from '../config/env';

export const mintParticipantToken = async (params: {
  roomName: string;
  participantIdentity: string;
}) => {
  const grant: VideoGrant = {
    room: params.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  };

  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: params.participantIdentity,
    ttl: `${env.LIVEKIT_TOKEN_TTL_SECONDS}s`
  });

  token.addGrant(grant);

  // Explicit dispatch ensures the worker joins as the dedicated agent participant.
  token.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: env.LIVEKIT_AGENT_NAME, metadata: '{}' })]
  });

  return token.toJwt();
};
