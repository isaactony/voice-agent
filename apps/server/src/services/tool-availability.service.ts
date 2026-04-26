import type { ToolCheckAvailabilityInput } from '@voice-agent/shared';

export const checkAvailability = async (input: ToolCheckAvailabilityInput) => {
  // TODO: Replace this with a real scheduling backend lookup.
  const slotsByPeriod: Record<ToolCheckAvailabilityInput['period'], string[]> = {
    morning: ['09:00', '09:30', '10:00'],
    afternoon: ['13:30', '14:00', '15:00'],
    evening: ['17:30', '18:00']
  };

  return {
    date: input.date,
    period: input.period,
    available: slotsByPeriod[input.period].length > 0,
    slots: slotsByPeriod[input.period]
  };
};
