import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import { sessions, users } from '../../database/schema/index.js';

const registrationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    password: z.string().min(12).max(128),
  })
  .strict();

const sessionDurationSeconds = 60 * 60 * 24 * 30;

export type AuthenticatedUser = Readonly<{
  id: string;
  email: string;
}>;

export type Registration = Readonly<{
  user: AuthenticatedUser;
  sessionToken: string;
}>;

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async register(input: unknown): Promise<Registration> {
    const command = registrationSchema.parse(input);
    const passwordHash = await argon2.hash(command.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const sessionToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1_000);

    try {
      const user = await this.database.db.transaction(async (transaction) => {
        const inserted = await transaction
          .insert(users)
          .values({ email: command.email, passwordHash })
          .returning({ id: users.id, email: users.email });
        const createdUser = inserted[0];

        if (!createdUser) {
          throw new Error('User insertion failed.');
        }

        await transaction.insert(sessions).values({
          userId: createdUser.id,
          tokenHash: hashSessionToken(sessionToken),
          expiresAt,
        });

        return createdUser;
      });

      return { user, sessionToken };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email is already registered.');
      }

      throw error;
    }
  }

  async getCurrentUser(
    sessionToken: string | undefined,
  ): Promise<AuthenticatedUser> {
    if (!sessionToken) {
      throw new UnauthorizedException();
    }

    const records = await this.database.db
      .select({ id: users.id, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, hashSessionToken(sessionToken)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    const user = records[0];

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }

  async login(input: unknown): Promise<Registration> {
    const command = registrationSchema.parse(input);
    const records = await this.database.db
      .select()
      .from(users)
      .where(eq(users.email, command.email))
      .limit(1);
    const user = records[0];

    if (!user || !(await argon2.verify(user.passwordHash, command.password))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const sessionToken = randomBytes(32).toString('base64url');
    await this.database.db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: new Date(Date.now() + sessionDurationSeconds * 1_000),
    });
    return { user: { id: user.id, email: user.email }, sessionToken };
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) return;
    await this.database.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashSessionToken(sessionToken)));
  }
}

export function sessionCookie(token: string, secure: boolean): string {
  const secureAttribute = secure ? '; Secure' : '';
  return `turkiye_session=${token}; Max-Age=${sessionDurationSeconds}; Path=/; HttpOnly; SameSite=Lax${secureAttribute}`;
}

export function expiredSessionCookie(secure: boolean): string {
  const secureAttribute = secure ? '; Secure' : '';
  return `turkiye_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secureAttribute}`;
}

export function readSessionCookie(
  cookie: string | undefined,
): string | undefined {
  if (!cookie) {
    return undefined;
  }

  return cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('turkiye_session='))
    ?.slice('turkiye_session='.length);
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}
