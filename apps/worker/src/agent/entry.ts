import { voice, defineAgent, inference, type JobContext } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { env } from '../config/env';
import { logger } from '../observability/logger';
import { checkAvailabilityTool } from '../tools/check-availability.tool';
import { findSessionIdByRoomName, writeOutcome, writeTranscriptEvent } from '../db/events';
import { storeEphemeralContext } from '../state/session-context';

const ASSISTANT_INSTRUCTIONS = `
You are a production-grade customer support and appointment booking voice agent.

Behavior rules:
- Be concise, warm, and operationally precise.
- Confirm critical details before making commitments.
- If the user interrupts, stop speaking and prioritize the latest user request.
- Use tools when availability or booking data is required.
- Never invent booking slots if a tool is available.
`;

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const participant = await ctx.waitForParticipant();
    const roomName = ctx.room.name ?? `room-${participant.identity}-${Date.now()}`;
    const persistedSessionId = await findSessionIdByRoomName(roomName);
    const runtimeSessionKey = roomName;

    logger.info(
      {
        roomName,
        participantIdentity: participant.identity,
        sessionId: persistedSessionId
      },
      'worker joined room'
    );

    if (!persistedSessionId) {
      logger.warn({ roomName }, 'no persisted session found for room; DB event writes will be skipped');
    }

    await storeEphemeralContext(runtimeSessionKey, {
      roomName,
      participantIdentity: participant.identity,
      status: 'connected'
    });

    if (persistedSessionId) {
      await writeTranscriptEvent({
        sessionId: persistedSessionId,
        source: 'system',
        content: 'Agent connected to room',
        metadata: { participantIdentity: participant.identity }
      });
    }

    // Half-cascade architecture:
    // 1) OpenAI Realtime handles low-latency understanding + text response generation.
    // 2) modalities=["text"] prevents final audio generation from OpenAI.
    // 3) Cartesia Sonic-3 is the only final speech synthesis layer.
    // Turn-taking tuning (barge-in + false interruption recovery):
    // We explicitly configure turn detection/endpointing/interruption behavior so we can
    // reduce false interruptions while still allowing responsive user barge-in.
    const turnHandling = {
      turnDetection: env.TURN_DETECTION_MODE,
      endpointing: {
        mode: 'fixed' as const,
        minDelay: env.TURN_ENDPOINTING_MIN_DELAY_MS,
        maxDelay: env.TURN_ENDPOINTING_MAX_DELAY_MS
      },
      interruption: {
        enabled: env.INTERRUPTION_ENABLED,
        mode: env.INTERRUPTION_MODE,
        minDuration: env.INTERRUPTION_MIN_DURATION_MS,
        minWords: env.INTERRUPTION_MIN_WORDS,
        falseInterruptionTimeout: env.INTERRUPTION_FALSE_TIMEOUT_MS,
        resumeFalseInterruption: env.INTERRUPTION_RESUME_FALSE,
        discardAudioIfUninterruptible: env.INTERRUPTION_DISCARD_AUDIO_IF_UNINTERRUPTIBLE
      }
    };

    logger.info({ turnHandling }, 'applied turn-taking configuration');

    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({
        model: env.OPENAI_REALTIME_MODEL,
        apiKey: env.OPENAI_API_KEY,
        modalities: ['text']
      }),
      tts: new inference.TTS({
        model: 'cartesia/sonic-3',
        voice: env.CARTESIA_VOICE_ID,
        language: env.CARTESIA_LANGUAGE
      }),
      turnHandling
    });

    session.on(voice.AgentSessionEventTypes.OverlappingSpeech, (ev) => {
      logger.info(
        {
          sessionId: persistedSessionId,
          roomName,
          interruptionProbability: ev.probability,
          overlapDurationSeconds: ev.totalDurationInS,
          detectionDelaySeconds: ev.detectionDelayInS,
          isInterruption: ev.isInterruption
        },
        'overlapping speech detected'
      );
    });

    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      logger.info({ roomName, sessionId: persistedSessionId, oldState: ev.oldState, newState: ev.newState }, 'user state changed');
    });

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      logger.info({ roomName, sessionId: persistedSessionId, oldState: ev.oldState, newState: ev.newState }, 'agent state changed');
    });

    const agent = new voice.Agent({
      instructions: ASSISTANT_INSTRUCTIONS,
      tools: {
        checkAvailability: checkAvailabilityTool(persistedSessionId)
      }
    });

    await session.start({
      room: ctx.room,
      agent,
      inputOptions: {
        audioEnabled: true,
        textEnabled: true
      }
    });

    if (persistedSessionId) {
      await writeOutcome({
        sessionId: persistedSessionId,
        outcomeType: 'session_started',
        summary: 'Agent session started successfully',
        metadata: {
          llm: env.OPENAI_REALTIME_MODEL,
          ttsModel: 'cartesia/sonic-3'
        }
      });
    }

    // TODO: Add production metrics: latency per turn, realtime token usage, and TTS synthesis duration.

    ctx.room.on('disconnected', async () => {
      if (persistedSessionId) {
        await writeOutcome({
          sessionId: persistedSessionId,
          outcomeType: 'session_ended',
          summary: 'Room disconnected'
        });
      }

      logger.info({ sessionId: persistedSessionId, roomName }, 'session ended');
    });
  }
});
