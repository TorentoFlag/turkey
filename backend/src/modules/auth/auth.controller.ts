import { Body, Controller, Get, Headers, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import type { AppEnv } from '../../config/env.js';
import {
  AuthService,
  expiredSessionCookie,
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

  @Post('auth/login')
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const login = await this.auth.login(body);
    response.header(
      'set-cookie',
      sessionCookie(login.sessionToken, this.secure),
    );
    return { email: login.user.email };
  }

  @Post('auth/logout')
  async logout(
    @Headers('cookie') cookie: string | undefined,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    await this.auth.logout(readSessionCookie(cookie));
    response.header('set-cookie', expiredSessionCookie(this.secure));
    return {};
  }

  private get secure(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }
}
