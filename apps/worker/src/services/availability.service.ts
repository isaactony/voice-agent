import type { ToolCheckAvailabilityInput } from '@voice-agent/shared';

export const checkAvailability = async ({ date, period }: ToolCheckAvailabilityInput) => {
  // TODO: Integrate with a real scheduling/calendar backend.
  const slotsByPeriod = {
    morning: ['09:00', '09:30', '10:00'],
    afternoon: ['13:00', '14:30'],
    evening: ['17:00']
  } as const;

  const slots = slotsByPeriod[period];
  return {
    date,
    period,
    available: slots.length > 0,
    slots
  };
};
