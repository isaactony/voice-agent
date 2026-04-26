import { llm } from '@livekit/agents';
import { toolCheckAvailabilityInputSchema } from '@voice-agent/shared';
import { logger } from '../observability/logger';
import { checkAvailability } from '../services/availability.service';
import { writeToolEvent } from '../db/events';

export const checkAvailabilityTool = (sessionId: string | null) =>
  llm.tool({
    description:
      'Check appointment availability for a given YYYY-MM-DD date and period (morning, afternoon, evening).',
    parameters: toolCheckAvailabilityInputSchema,
    execute: async (args) => {
      logger.info({ sessionId, args }, 'tool call: checkAvailability');

      try {
        const result = await checkAvailability(args);

        if (sessionId) {
          await writeToolEvent({
            sessionId,
            toolName: 'checkAvailability',
            requestPayload: args,
            responsePayload: result,
            status: 'ok'
          });
        }

        return result;
      } catch (error) {
        const message = (error as Error).message;

        if (sessionId) {
          await writeToolEvent({
            sessionId,
            toolName: 'checkAvailability',
            requestPayload: args,
            responsePayload: { error: message },
            status: 'error'
          });
        }

        throw error;
      }
    }
  });
