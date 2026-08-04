import { timingSafeEqual } from 'node:crypto';

type HeaderValue = string | string[] | undefined;

type AdminHeaders = Readonly<Record<string, HeaderValue>>;

export type AuthenticatedAdmin = Readonly<{ actorId: string }>;

const actorIdMaxLength = 128;

function readHeader(headers: AdminHeaders, name: string): string | undefined {
  const value = headers[name];

  return typeof value === 'string' ? value : undefined;
}

function matchesStaticApiKey(
  received: string | undefined,
  expected: string,
): boolean {
  if (!received || !expected) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function authenticateAdminRequest(
  headers: AdminHeaders,
  expectedApiKey: string,
): AuthenticatedAdmin {
  const actorId = readHeader(headers, 'x-admin-actor-id')?.trim();

  if (
    !matchesStaticApiKey(
      readHeader(headers, 'x-admin-api-key'),
      expectedApiKey,
    ) ||
    !actorId ||
    actorId.length > actorIdMaxLength
  ) {
    throw new Error('Admin authentication failed.');
  }

  return { actorId };
}
