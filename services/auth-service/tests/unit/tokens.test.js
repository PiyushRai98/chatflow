/**
 * Unit tests for JWT / refresh token utilities.
 * DB layer is mocked so these run pure in-process.
 */
jest.mock('../../src/models/database', () => ({
  pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

const jwt = require('jsonwebtoken');
const config = require('../../src/utils/config');
const {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  storeRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} = require('../../src/utils/tokens');
const { pool } = require('../../src/models/database');

describe('tokens utility', () => {
  beforeEach(() => {
    pool.query.mockClear();
  });

  describe('generateAccessToken', () => {
    it('issues a JWT containing the user id and username', () => {
      const token = generateAccessToken({ id: 'u-1', username: 'alice' });
      const decoded = jwt.verify(token, config.jwt.secret);
      expect(decoded.sub).toBe('u-1');
      expect(decoded.username).toBe('alice');
      expect(decoded.type).toBe('access');
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    it('produces tokens with a short lifetime (<= 1h)', () => {
      const token = generateAccessToken({ id: 'u-2', username: 'bob' });
      const { iat, exp } = jwt.verify(token, config.jwt.secret);
      expect(exp - iat).toBeLessThanOrEqual(60 * 60);
    });
  });

  describe('generateRefreshToken', () => {
    it('returns an 80-char hex string (40 random bytes)', () => {
      const token = generateRefreshToken();
      expect(token).toMatch(/^[a-f0-9]{80}$/);
    });

    it('returns distinct tokens on each call', () => {
      const set = new Set(Array.from({ length: 100 }, generateRefreshToken));
      expect(set.size).toBe(100);
    });
  });

  describe('hashToken', () => {
    it('is deterministic', () => {
      expect(hashToken('abc')).toBe(hashToken('abc'));
    });

    it('produces a 64-char sha256 digest', () => {
      expect(hashToken('abc')).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is not equal to the input (i.e. actually hashing)', () => {
      const t = 'my-secret-token';
      expect(hashToken(t)).not.toBe(t);
    });
  });

  describe('storeRefreshToken', () => {
    it('inserts hashed token with 7-day expiry', async () => {
      await storeRefreshToken('u-1', 'raw-token', 'ios-app');
      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/INSERT INTO refresh_tokens/);
      expect(params[0]).toBe('u-1');
      expect(params[1]).toBe(hashToken('raw-token')); // stored hashed, never plain
      expect(params[2]).toBe('ios-app');
      const expiresAt = params[3];
      const deltaMs = expiresAt.getTime() - Date.now();
      expect(deltaMs).toBeGreaterThan(6 * 24 * 3600 * 1000);
      expect(deltaMs).toBeLessThanOrEqual(7 * 24 * 3600 * 1000 + 1000);
    });

    it('defaults device_info to "unknown" when omitted', async () => {
      await storeRefreshToken('u-1', 'raw');
      expect(pool.query.mock.calls[0][1][2]).toBe('unknown');
    });
  });

  describe('verifyRefreshToken', () => {
    it('returns row when token is valid and not revoked', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'u-1', username: 'alice' }],
      });
      const result = await verifyRefreshToken('good-token');
      expect(result).toEqual({ id: 1, user_id: 'u-1', username: 'alice' });
      expect(pool.query.mock.calls[0][1][0]).toBe(hashToken('good-token'));
    });

    it('returns null when token is missing/expired/revoked', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      expect(await verifyRefreshToken('bad-token')).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('sets revoked_at via hashed lookup', async () => {
      await revokeRefreshToken('raw');
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/revoked_at = NOW\(\)/);
      expect(params[0]).toBe(hashToken('raw'));
    });
  });

  describe('revokeAllUserTokens', () => {
    it('revokes every active token for the user', async () => {
      await revokeAllUserTokens('u-1');
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/user_id = \$1/);
      expect(sql).toMatch(/revoked_at IS NULL/);
      expect(params).toEqual(['u-1']);
    });
  });
});
