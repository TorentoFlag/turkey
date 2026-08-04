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
  authenticateAdminRequest,
  type AuthenticatedAdmin,
} from './admin-api-auth.js';

const adminActor = Symbol('adminActor');

type AdminRequest = FastifyRequest & {
  [adminActor]?: AuthenticatedAdmin;
};

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();

    try {
      request[adminActor] = authenticateAdminRequest(
        request.headers,
        this.config.get('ADMIN_API_KEY', { infer: true }),
      );
      return true;
    } catch {
      throw new UnauthorizedException('Admin authentication failed.');
    }
  }
}

export function getAdminActor(request: FastifyRequest): AuthenticatedAdmin {
  const actor = (request as AdminRequest)[adminActor];

  if (!actor) {
    throw new Error('Authenticated admin actor is missing.');
  }

  return actor;
}

export const AdminActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin =>
    getAdminActor(context.switchToHttp().getRequest<FastifyRequest>()),
);
