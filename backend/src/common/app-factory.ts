import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.js';
import { registerRequestContext } from './request-context.js';

export async function createApiApp(
  module: Type<unknown>,
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ logger: false });
  const fastify = adapter.getInstance();

  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (request, body, done) => {
      if (request.url.split('?')[0] === '/v1/webhooks/arc') {
        done(null, body);
        return;
      }

      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (error) {
        done(error as Error);
      }
    },
  );
  const app = await NestFactory.create<NestFastifyApplication>(
    module,
    adapter,
    // Fastify must retain Arc webhook bytes untouched until its signature is
    // checked. The parser above still decodes JSON for every other endpoint.
    { bodyParser: false },
  );

  registerRequestContext(app);
  const config = app.get(ConfigService<AppEnv, true>);
  const webAppOrigin = config.get('WEB_APP_ORIGIN', { infer: true });

  if (webAppOrigin) {
    app.enableCors({
      origin: (origin, callback) => {
        callback(null, origin === webAppOrigin);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH'],
    });
  }
  app.enableShutdownHooks();

  return app;
}
