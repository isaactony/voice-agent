import { voice, defineAgent, inference, type JobContext } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { env } from '../config/env';
import { logger } from '../observability/logger';
import { checkAvailabilityTool } from '../tools/check-availability.tool';
import { findSessionIdByRoomName, updateSessionStatus, writeOutcome, writeTranscriptEvent } from '../db/events';
import { deleteEphemeralContext, mergeEphemeralContext, storeEphemeralContext } from '../state/session-context';

const ASSISTANT_INSTRUCTIONS = `
You are a production-grade general voice assistant.

Behavior rules:
- Help with a broad range of user questions and tasks.
- Be concise, warm, accurate, and practical.
- If you are uncertain, say so briefly and ask a clarifying question.
- If the user interrupts, stop speaking and prioritize the latest request.
- Use available tools only when they add real value to the current task.
- For appointment requests, use the availability tool instead of inventing slots.
- Do not claim actions were completed unless a tool/system confirms success.
`;

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const safeSideEffect = async (op: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (error) {
        logger.warn({ err: error, op }, 'non-blocking side effect failed');
      }
    };

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

    await safeSideEffect('storeEphemeralContext.connected', async () => {
      await storeEphemeralContext(runtimeSessionKey, {
        roomName,
        participantIdentity: participant.identity,
        status: 'connected'
      });
    });

    if (persistedSessionId) {
      await safeSideEffect('updateSessionStatus.active', async () => {
        await updateSessionStatus(persistedSessionId, 'active');
      });
    }

    if (persistedSessionId) {
      await safeSideEffect('writeTranscriptEvent.agent_connected', async () => {
        await writeTranscriptEvent({
          sessionId: persistedSessionId,
          source: 'system',
          content: 'Agent connected to room',
          metadata: { participantIdentity: participant.identity }
        });
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

    let agentState: 'initializing' | 'idle' | 'listening' | 'thinking' | 'speaking' = 'initializing';
    let userState: 'speaking' | 'listening' | 'away' = 'listening';
    let proactiveSessionActive = false;
    let idleNudgeTimer: NodeJS.Timeout | null = null;
    let clarificationTimer: NodeJS.Timeout | null = null;
    let idleNudgesSent = 0;
    let hasUserSpoken = false;

    const clearIdleNudgeTimer = () => {
      if (idleNudgeTimer) {
        clearTimeout(idleNudgeTimer);
        idleNudgeTimer = null;
      }
    };

    const clearClarificationTimer = () => {
      if (clarificationTimer) {
        clearTimeout(clarificationTimer);
        clarificationTimer = null;
      }
    };

    const canProactivelySpeak = () =>
      env.PROACTIVE_UX_ENABLED &&
      proactiveSessionActive &&
      hasUserSpoken &&
      agentState === 'listening' &&
      userState !== 'speaking';

    const safeSessionSay = async (text: string, reason: 'idle_nudge' | 'clarification_reprompt') => {
      try {
        if (!canProactivelySpeak()) return;
        session.say(text, { allowInterruptions: true, addToChatCtx: false });
        logger.info({ roomName, sessionId: persistedSessionId, reason, text }, 'proactive ux prompt sent');
        if (persistedSessionId) {
          await safeSideEffect(`writeTranscriptEvent.${reason}`, async () => {
            await writeTranscriptEvent({
              sessionId: persistedSessionId,
              source: 'system',
              content: text,
              metadata: { reason, proactive: true }
            });
          });
        }
      } catch (error) {
        logger.warn({ err: error, reason }, 'failed to emit proactive ux prompt');
      }
    };

    const scheduleIdleNudge = () => {
      clearIdleNudgeTimer();
      if (!canProactivelySpeak()) return;
      if (idleNudgesSent >= env.PROACTIVE_MAX_IDLE_NUDGES) return;

      idleNudgeTimer = setTimeout(async () => {
        if (!canProactivelySpeak()) return;
        idleNudgesSent += 1;
        await safeSessionSay(
          idleNudgesSent === 1
            ? 'Are you still there? I can continue whenever you are ready.'
            : 'No rush. If you want to continue, tell me your next question.',
          'idle_nudge'
        );

        if (idleNudgesSent < env.PROACTIVE_MAX_IDLE_NUDGES) {
          scheduleIdleNudge();
        }
      }, env.PROACTIVE_IDLE_NUDGE_MS);
    };

    const scheduleClarificationReprompt = () => {
      clearClarificationTimer();
      if (!canProactivelySpeak()) return;

      clarificationTimer = setTimeout(async () => {
        if (!canProactivelySpeak()) return;
        await safeSessionSay(
          'I might have missed that. Could you rephrase or add a bit more detail?',
          'clarification_reprompt'
        );
      }, env.PROACTIVE_CLARIFICATION_REPROMPT_MS);
    };

    const normalize = (text: string) => text.trim().toLowerCase().replace(/[.!?]+$/g, '');
    const isAmbiguousTranscript = (text: string) => {
      const cleaned = normalize(text);
      if (!cleaned) return true;
      if (cleaned.length <= 2) return true;
      const lowSignalPhrases = new Set([
        'huh',
        'hm',
        'hmm',
        'uh',
        'um',
        'what',
        'hello',
        'can you repeat',
        'say again'
      ]);
      return lowSignalPhrases.has(cleaned);
    };

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
      userState = ev.newState;
      logger.info({ roomName, sessionId: persistedSessionId, oldState: ev.oldState, newState: ev.newState }, 'user state changed');

      if (!env.PROACTIVE_UX_ENABLED) return;

      if (ev.newState === 'speaking') {
        clearIdleNudgeTimer();
        clearClarificationTimer();
        return;
      }

      if (ev.newState === 'listening') {
        scheduleIdleNudge();
        return;
      }

      if (ev.newState === 'away') {
        scheduleIdleNudge();
      }
    });

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      agentState = ev.newState;
      logger.info({ roomName, sessionId: persistedSessionId, oldState: ev.oldState, newState: ev.newState }, 'agent state changed');

      if (!env.PROACTIVE_UX_ENABLED) return;

      if (ev.newState === 'speaking' || ev.newState === 'thinking') {
        clearIdleNudgeTimer();
        clearClarificationTimer();
        return;
      }

      if (ev.newState === 'listening') {
        scheduleIdleNudge();
      }
    });

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (!ev.isFinal) return;
      hasUserSpoken = true;
      idleNudgesSent = 0;
      clearIdleNudgeTimer();
      clearClarificationTimer();

      if (!env.PROACTIVE_UX_ENABLED) return;
      if (isAmbiguousTranscript(ev.transcript)) {
        scheduleClarificationReprompt();
      } else {
        scheduleIdleNudge();
      }
    });

    session.on(voice.AgentSessionEventTypes.Close, (ev) => {
      proactiveSessionActive = false;
      clearIdleNudgeTimer();
      clearClarificationTimer();
      void safeSideEffect('mergeEphemeralContext.closed', async () => {
        await mergeEphemeralContext(runtimeSessionKey, {
          status: 'agent_session_closed',
          closeReason: ev.reason,
          closedAt: new Date().toISOString()
        });
      });

      if (persistedSessionId) {
        void safeSideEffect('updateSessionStatus.ended.close', async () => {
          await updateSessionStatus(persistedSessionId, 'ended');
        });
      }

      logger.info(
        { roomName, sessionId: persistedSessionId, reason: ev.reason, error: ev.error },
        'agent session closed'
      );
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
    proactiveSessionActive = true;

    if (persistedSessionId) {
      await safeSideEffect('writeOutcome.session_started', async () => {
        await writeOutcome({
          sessionId: persistedSessionId,
          outcomeType: 'session_started',
          summary: 'Agent session started successfully',
          metadata: {
            llm: env.OPENAI_REALTIME_MODEL,
            ttsModel: 'cartesia/sonic-3'
          }
        });
      });
    }

    // TODO: Add production metrics: latency per turn, realtime token usage, and TTS synthesis duration.

    ctx.room.on('disconnected', async () => {
      proactiveSessionActive = false;
      clearIdleNudgeTimer();
      clearClarificationTimer();

      await safeSideEffect('mergeEphemeralContext.disconnected', async () => {
        await mergeEphemeralContext(runtimeSessionKey, {
          status: 'disconnected',
          disconnectedAt: new Date().toISOString()
        });
      });

      await safeSideEffect('deleteEphemeralContext.disconnected', async () => {
        await deleteEphemeralContext(runtimeSessionKey);
      });

      if (persistedSessionId) {
        await safeSideEffect('updateSessionStatus.ended.room_disconnected', async () => {
          await updateSessionStatus(persistedSessionId, 'ended');
        });

        await safeSideEffect('writeOutcome.session_ended', async () => {
          await writeOutcome({
            sessionId: persistedSessionId,
            outcomeType: 'session_ended',
            summary: 'Room disconnected'
          });
        });
      }

      logger.info({ sessionId: persistedSessionId, roomName }, 'session ended');
    });
  }
});
