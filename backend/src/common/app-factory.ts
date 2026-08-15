import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import multipart from '@fastify/multipart';
import { Readable } from 'node:stream';
import type { AppEnv } from '../config/env.js';
import { registerRequestContext } from './request-context.js';
import { PRODUCT_PHOTO_MAX_BYTES } from '../modules/media/product-media.service.js';

const protocolMetadataAllowanceBytes = 32 * 1024;
export const protocolRawBodyMaxBytes =
  PRODUCT_PHOTO_MAX_BYTES + protocolMetadataAllowanceBytes;

export async function createApiApp(
  module: Type<unknown>,
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ logger: false });
  const fastify = adapter.getInstance();

  fastify.addHook('preParsing', async (request, _reply, payload) => {
    if (!isProtocolRoute(request.url)) {
      return payload;
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      request.rawBody = Buffer.alloc(0);
      return payload;
    }

    const declaredLength = Number(request.headers['content-length']);

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > protocolRawBodyMaxBytes
    ) {
      throw payloadTooLarge();
    }

    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of payload) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;

      if (size > protocolRawBodyMaxBytes) {
        throw payloadTooLarge();
      }

      chunks.push(buffer);
    }

    request.rawBody = Buffer.concat(chunks, size);
    const replay = Readable.from([request.rawBody]);
    Object.assign(replay, {
      headers: request.raw.headers,
      method: request.raw.method,
      receivedEncodedLength: request.rawBody.length,
      url: request.raw.url,
    });
    request.raw = replay as typeof request.raw;

    return replay;
  });

  await fastify.register(multipart, {
    limits: {
      files: 1,
      fileSize: PRODUCT_PHOTO_MAX_BYTES,
      fields: 1,
      parts: 2,
    },
  });

  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser(
    'application/json',
    { bodyLimit: protocolRawBodyMaxBytes, parseAs: 'buffer' },
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

function isProtocolRoute(url: string): boolean {
  const path = url.split('?')[0];

  return (
    path.startsWith('/admin/integration/') ||
    path.startsWith('/api/admin/integration/')
  );
}

function payloadTooLarge(): Error & { statusCode: number } {
  return Object.assign(new Error('Protocol request body exceeds the limit.'), {
    statusCode: 413,
  });
}
