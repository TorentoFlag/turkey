import { Body, Controller, Get, Headers, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import type { AppEnv } from '../../config/env.js';
import {
  AuthService,
  readSessionCookie,
  sessionCookie,
} from './auth.service.js';

@Controller('v1')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Post('auth/register')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const registration = await this.auth.register(body);
    response.header(
      'set-cookie',
      sessionCookie(
        registration.sessionToken,
        this.config.get('NODE_ENV', { infer: true }) === 'production',
      ),
    );
    return { email: registration.user.email };
  }

  @Get('me')
  async me(@Headers('cookie') cookie: string | undefined) {
    const user = await this.auth.getCurrentUser(readSessionCookie(cookie));
    return { email: user.email };
  }
}
