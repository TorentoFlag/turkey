import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { AppEnv } from '../../config/env.js';
import {
  authenticateProtocolRequest,
  type AuthenticatedProtocolActor,
} from './protocol-auth.js';

const protocolActor = Symbol('protocolActor');

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export type ProtocolRequest = FastifyRequest & {
  [protocolActor]?: AuthenticatedProtocolActor;
};

@Injectable()
export class ProtocolAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ProtocolRequest>();

    try {
      request[protocolActor] = authenticateProtocolRequest(
        {
          headers: request.headers,
          method: request.method,
          path: request.url,
          rawBody: request.rawBody ?? Buffer.alloc(0),
        },
        this.config.get('VV_ADMIN_INTEGRATION_SECRET', { infer: true }),
        this.config.get('VV_ADMIN_INTEGRATION_SITE_KEY', { infer: true }),
      );
      return true;
    } catch {
      throw new UnauthorizedException('Integration authentication failed.');
    }
  }
}

export function getProtocolActor(
  request: FastifyRequest,
): AuthenticatedProtocolActor {
  const actor = (request as ProtocolRequest)[protocolActor];

  if (!actor) {
    throw new Error('Authenticated integration actor is missing.');
  }

  return actor;
}

export const ProtocolActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedProtocolActor =>
    getProtocolActor(context.switchToHttp().getRequest<FastifyRequest>()),
);
