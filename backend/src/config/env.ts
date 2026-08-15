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
  VV_ADMIN_INTEGRATION_SECRET: z.string().trim().min(1),
  VV_ADMIN_INTEGRATION_SITE_KEY: z.string().trim().min(1).max(128),
  MINIO_ENDPOINT: z.string().url(),
  MINIO_BUCKET: z.string().trim().min(3).max(63),
  MINIO_ACCESS_KEY: z.string().trim().min(3),
  MINIO_SECRET_KEY: z.string().trim().min(16),
  MEDIA_PUBLIC_BASE_URL: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.search && !url.hash;
    }),
  ARC_API_BASE_URL: z.string().url().default('https://api.arcpay.space/v1'),
  ARC_SECRET_API_KEY: z.string().trim().min(1).optional(),
  ARC_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  RESEND_FROM: z.string().trim().min(1).max(320).optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  WEB_APP_ORIGIN: z.string().url().optional(),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86_400)
    .default(900),
  WORKER_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(250)
    .max(300_000)
    .default(5_000),
});

export type AppEnv = Readonly<z.output<typeof envSchema>>;

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    throw new Error('Invalid application configuration.');
  }

  return result.data;
}
