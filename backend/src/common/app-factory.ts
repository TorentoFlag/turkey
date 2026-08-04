import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { registerRequestContext } from './request-context.js';

export async function createApiApp(
  module: Type<unknown>,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    module,
    new FastifyAdapter({ logger: false }),
    { rawBody: true },
  );

  registerRequestContext(app);
  app.enableShutdownHooks();

  return app;
}
