import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export function registerRequestContext(app: NestFastifyApplication): void {
  const server = app.getHttpAdapter().getInstance();

  server.addHook('onRequest', (request, reply, done) => {
    const requestId = getRequestId(request.headers['x-request-id']);
    request.id = requestId;
    reply.header('x-request-id', requestId);
    done();
  });
}

function getRequestId(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : randomUUID();
}
