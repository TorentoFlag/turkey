import { z } from 'zod';

const logLevels = ['debug', 'info', 'warn', 'error'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65_535),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => {
      try {
        return new URL(value).protocol === 'postgresql:';
      } catch {
        return false;
      }
    }, 'DATABASE_URL must use the postgresql protocol'),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  ADMIN_API_KEY: z.string().trim().min(1),
});

export type AppEnv = Readonly<z.output<typeof envSchema>>;

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    throw new Error('Invalid application configuration.');
  }

  return result.data;
}
