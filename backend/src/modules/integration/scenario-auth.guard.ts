import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { AppEnv } from '../../config/env.js';

const timestampWindowMilliseconds = 300_000;
const strictUtcTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

@Injectable()
export class ScenarioAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (
      verifyScenarioSignature({
        body: request.rawBody ?? Buffer.alloc(0),
        path: request.url,
        signature: readHeader(request, 'x-vv-admin-signature'),
        timestamp: readHeader(request, 'x-vv-admin-timestamp'),
        secret: this.config.get('VV_ADMIN_INTEGRATION_SECRET', { infer: true }),
      })
    ) {
      return true;
    }

    throw new UnauthorizedException('Integration authentication failed.');
  }
}

function verifyScenarioSignature(input: {
  body: Buffer;
  path: string;
  signature: string | undefined;
  timestamp: string | undefined;
  secret: string;
}): boolean {
  if (
    !input.signature ||
    !input.timestamp ||
    !isCurrentTimestamp(input.timestamp)
  ) {
    return false;
  }

  const bodyHash = createHash('sha256').update(input.body).digest('hex');
  const expected = createHmac('sha256', input.secret)
    .update(['POST', input.path, input.timestamp, bodyHash].join('\n'))
    .digest('hex');
  const suppliedBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

function isCurrentTimestamp(value: string): boolean {
  if (!strictUtcTimestampPattern.test(value)) return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) &&
    Math.abs(Date.now() - timestamp) <= timestampWindowMilliseconds
  );
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}
