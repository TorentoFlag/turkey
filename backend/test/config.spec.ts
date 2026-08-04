import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/turkiye_test',
  LOG_LEVEL: 'warn',
};

describe('parseEnv', () => {
  it('returns typed configuration for a valid environment', () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: 'test',
      PORT: 3001,
      DATABASE_URL: valid.DATABASE_URL,
      LOG_LEVEL: 'warn',
    });
  });

  it.each([
    { ...valid, DATABASE_URL: undefined },
    { ...valid, DATABASE_URL: 'not-a-url' },
    { ...valid, PORT: '0' },
    { ...valid, NODE_ENV: 'preview' },
  ])('rejects invalid server configuration', (input) => {
    expect(() => parseEnv(input)).toThrow(/configuration/i);
  });
});
