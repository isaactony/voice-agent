import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

export const loadEnv = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => {
  loadDotenv();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
};
