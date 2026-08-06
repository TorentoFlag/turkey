import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppEnv } from '../../config/env.js';
import {
  AuthService,
  expiredSessionCookie,
  readSessionCookie,
  sessionCookie,
} from './auth.service.js';
import {
  SessionCsrfGuard,
  TrustedBrowserOriginGuard,
} from './browser-security.guard.js';

@Controller('v1')
@UseGuards(TrustedBrowserOriginGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Post('auth/register')
  async register(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const registration = await this.auth.register(body, request.ip);
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

  @Get('auth/csrf')
  async csrf(@Headers('cookie') cookie: string | undefined) {
    const sessionToken = readSessionCookie(cookie);
    await this.auth.getCurrentUser(sessionToken);

    if (!sessionToken) {
      throw new Error('Authenticated session token is missing.');
    }

    return { token: this.auth.csrfToken(sessionToken) };
  }

  @Post('auth/login')
  async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) response: FastifyReply,
  ) {
    const login = await this.auth.login(body, request.ip);
    response.header(
      'set-cookie',
      sessionCookie(login.sessionToken, this.secure),
    );
    return { email: login.user.email };
  }

  @Post('auth/logout')
  @UseGuards(SessionCsrfGuard)
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
