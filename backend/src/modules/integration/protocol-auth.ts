import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

type HeaderValue = string | string[] | undefined;

export type ProtocolHeaders = Readonly<Record<string, HeaderValue>>;

export type AuthenticatedProtocolActor = Readonly<{
  actorId: string;
  idempotencyKey: string | null;
  requestId: string;
  siteKey: string;
}>;

export type ProtocolAuthenticationInput = Readonly<{
  headers: ProtocolHeaders;
  method: string;
  path: string;
  rawBody: Buffer;
}>;

const actorIdMaxLength = 128;
const signatureVersion = '1';
const timestampWindowMilliseconds = 300_000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function authenticateProtocolRequest(
  input: ProtocolAuthenticationInput,
  secret: string,
  expectedSiteKey: string,
  now: Date = new Date(),
): AuthenticatedProtocolActor {
  const actorId = readHeader(input.headers, 'x-vv-actor-id')?.trim();
  const requestId = readHeader(input.headers, 'x-vv-request-id');
  const siteKey = readHeader(input.headers, 'x-vv-site-key');
  const timestamp = readHeader(input.headers, 'x-vv-timestamp');
  const suppliedSignature = readHeader(input.headers, 'x-vv-signature');
  const idempotencyKey = readHeader(input.headers, 'idempotency-key');
  const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(
    input.method.toUpperCase(),
  );

  if (
    !actorId ||
    actorId.length > actorIdMaxLength ||
    !requestId ||
    !isUuid(requestId) ||
    siteKey !== expectedSiteKey ||
    !timestamp ||
    !isCurrentTimestamp(timestamp, now) ||
    readHeader(input.headers, 'x-vv-signature-version') !== signatureVersion ||
    !suppliedSignature ||
    (isMutation && (!idempotencyKey || !isUuid(idempotencyKey)))
  ) {
    throw new Error('Integration authentication failed.');
  }

  const rawBodyDigest = createHash('sha256')
    .update(input.rawBody)
    .digest('hex');
  const canonicalValue = `v1.${timestamp}.${requestId}.${input.method.toUpperCase()}.${input.path}.${rawBodyDigest}`;
  const expectedSignature = `sha256=${createHmac('sha256', secret)
    .update(canonicalValue)
    .digest('hex')}`;

  if (!matchesSignature(suppliedSignature, expectedSignature)) {
    throw new Error('Integration authentication failed.');
  }

  return {
    actorId,
    idempotencyKey: idempotencyKey ?? null,
    requestId,
    siteKey,
  };
}

function readHeader(
  headers: ProtocolHeaders,
  name: string,
): string | undefined {
  const value = headers[name];

  return typeof value === 'string' ? value : undefined;
}

function isCurrentTimestamp(value: string, now: Date): boolean {
  const timestamp = Date.parse(value);

  return (
    Number.isFinite(timestamp) &&
    Math.abs(now.getTime() - timestamp) <= timestampWindowMilliseconds
  );
}

function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

function matchesSignature(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}
