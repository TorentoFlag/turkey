import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { AppEnv } from '../../config/env.js';
import { AuthService, readSessionCookie } from './auth.service.js';

type BrowserRequest = FastifyRequest & {
  headers: FastifyRequest['headers'] & {
    origin?: string;
    'x-csrf-token'?: string;
  };
};

function isMutation(request: BrowserRequest): boolean {
  return ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method);
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

@Injectable()
export class TrustedBrowserOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<BrowserRequest>();
    const origin = headerValue(request.headers.origin);

    if (!isMutation(request) || origin === undefined) {
      return true;
    }

    if (origin !== this.config.get('WEB_APP_ORIGIN', { infer: true })) {
      throw new ForbiddenException('Untrusted browser origin.');
    }

    return true;
  }
}

@Injectable()
export class SessionCsrfGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<BrowserRequest>();
    const origin = headerValue(request.headers.origin);
    const sessionToken = readSessionCookie(headerValue(request.headers.cookie));

    if (!isMutation(request) || origin === undefined || !sessionToken) {
      return true;
    }

    const csrfToken = headerValue(request.headers['x-csrf-token']);
    if (!this.auth.isCsrfTokenValid(sessionToken, csrfToken)) {
      throw new ForbiddenException('Invalid CSRF token.');
    }

    return true;
  }
}
