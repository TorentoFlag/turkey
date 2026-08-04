import { describe, expect, it } from 'vitest';
import { authenticateAdminRequest } from '../src/modules/admin-api/admin-api-auth.js';

const adminApiKey = 'admin-static-key-for-test';

describe('authenticateAdminRequest', () => {
  it('accepts the exact static key and returns the trusted actor ID', () => {
    expect(
      authenticateAdminRequest(
        {
          'x-admin-api-key': adminApiKey,
          'x-admin-actor-id': 'manager-42',
        },
        adminApiKey,
      ),
    ).toEqual({ actorId: 'manager-42' });
  });

  it.each([
    [{ 'x-admin-actor-id': 'manager-42' }],
    [{ 'x-admin-api-key': 'wrong-key', 'x-admin-actor-id': 'manager-42' }],
    [{ 'x-admin-api-key': adminApiKey }],
    [{ 'x-admin-api-key': adminApiKey, 'x-admin-actor-id': '   ' }],
  ])('rejects an unauthenticated or unattributed admin request', (headers) => {
    expect(() => authenticateAdminRequest(headers, adminApiKey)).toThrow(
      /admin authentication failed/i,
    );
  });
});
