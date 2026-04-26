import { z } from 'zod';

export const startSessionRequestSchema = z.object({
  userId: z.string().min(1),
  channel: z.enum(['web']).default('web'),
  context: z
    .object({
      locale: z.string().optional(),
      timezone: z.string().optional(),
      metadata: z.record(z.string()).optional()
    })
    .optional()
});

export type StartSessionRequest = z.infer<typeof startSessionRequestSchema>;

export const startSessionResponseSchema = z.object({
  sessionId: z.string(),
  roomName: z.string(),
  token: z.string(),
  livekitUrl: z.string().url(),
  expiresAt: z.string()
});

export type StartSessionResponse = z.infer<typeof startSessionResponseSchema>;

export const toolCheckAvailabilityInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.enum(['morning', 'afternoon', 'evening'])
});

export type ToolCheckAvailabilityInput = z.infer<typeof toolCheckAvailabilityInputSchema>;

export const agentStateSchema = z.enum([
  'connecting',
  'listening',
  'thinking',
  'speaking',
  'error',
  'disconnected'
]);

export type AgentState = z.infer<typeof agentStateSchema>;
