import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/turkiye_test',
  LOG_LEVEL: 'warn',
  ADMIN_API_KEY: 'test-static-admin-key',
};

describe('parseEnv', () => {
  it('returns typed configuration for a valid environment', () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: 'test',
      PORT: 3001,
      DATABASE_URL: valid.DATABASE_URL,
      LOG_LEVEL: 'warn',
      ADMIN_API_KEY: valid.ADMIN_API_KEY,
      ARC_API_BASE_URL: 'https://api.arcpay.space/v1',
    });
  });

  it.each([
    { ...valid, DATABASE_URL: undefined },
    { ...valid, DATABASE_URL: 'not-a-url' },
    { ...valid, PORT: '0' },
    { ...valid, NODE_ENV: 'preview' },
    { ...valid, ADMIN_API_KEY: undefined },
    { ...valid, ADMIN_API_KEY: '   ' },
  ])('rejects invalid server configuration', (input) => {
    expect(() => parseEnv(input)).toThrow(/configuration/i);
  });
});
