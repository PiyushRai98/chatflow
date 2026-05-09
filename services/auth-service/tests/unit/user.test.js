/**
 * Unit tests for the User model with pg mocked.
 * Verifies password hashing, SQL shape, and parameter binding.
 */
jest.mock('../../src/models/database', () => ({
  pool: { query: jest.fn() },
}));

const bcrypt = require('bcryptjs');
const User = require('../../src/models/User');
const { pool } = require('../../src/models/database');

describe('User model', () => {
  beforeEach(() => pool.query.mockReset());

  describe('create', () => {
    it('bcrypt-hashes the password before persisting', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [{ id: 'u-1', username: 'alice', email: 'a@x.io' }],
      });
      await User.create({
        username: 'alice',
        email: 'a@x.io',
        password: 'hunter2',
        displayName: 'Alice',
      });
      const [, params] = pool.query.mock.calls[0];
      expect(params[2]).not.toBe('hunter2');
      expect(params[2]).toMatch(/^\$2[aby]\$/); // bcrypt format
      expect(await bcrypt.compare('hunter2', params[2])).toBe(true);
    });

    it('returns the created user row (without password_hash)', async () => {
      const row = { id: 'u-1', username: 'alice', email: 'a@x.io' };
      pool.query.mockResolvedValueOnce({ rows: [row] });
      const result = await User.create({
        username: 'alice', email: 'a@x.io', password: 'pw', displayName: 'Alice',
      });
      expect(result).toEqual(row);
    });
  });

  describe('findByEmail / findByUsername / findById', () => {
    it.each([
      ['findByEmail', 'a@x.io', /WHERE email = \$1/],
      ['findByUsername', 'alice', /WHERE username = \$1/],
      ['findById', 'u-1', /WHERE id = \$1/],
    ])('%s queries by the correct column', async (method, arg, sqlRe) => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'u-1' }] });
      await User[method](arg);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(sqlRe);
      expect(params).toEqual([arg]);
    });

    it('returns null when no row matches', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      expect(await User.findByEmail('missing@x.io')).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('builds a dynamic SET clause only for provided fields', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'u-1' }] });
      await User.updateProfile('u-1', { displayName: 'New' });
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/display_name = \$1/);
      expect(sql).not.toMatch(/avatar_url/);
      expect(sql).not.toMatch(/\bbio\b/);
      expect(sql).toMatch(/updated_at = NOW\(\)/);
      expect(params).toEqual(['New', 'u-1']);
    });

    it('includes all three fields when all provided', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ id: 'u-1' }] });
      await User.updateProfile('u-1', {
        displayName: 'N', avatarUrl: 'https://x/a.png', bio: 'hi',
      });
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/display_name = \$1/);
      expect(sql).toMatch(/avatar_url = \$2/);
      expect(sql).toMatch(/bio = \$3/);
      expect(params).toEqual(['N', 'https://x/a.png', 'hi', 'u-1']);
    });

    it('returns null when there are no fields to update (no query issued)', async () => {
      const result = await User.updateProfile('u-1', {});
      expect(result).toBeNull();
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('wraps the query in wildcards and applies the limit', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      await User.search('ali', 10);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toMatch(/ILIKE \$1/);
      expect(params).toEqual(['%ali%', 10]);
    });

    it('defaults limit to 20', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      await User.search('ali');
      expect(pool.query.mock.calls[0][1][1]).toBe(20);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for matching plaintext/hash', async () => {
      const hash = await bcrypt.hash('pw', 4);
      expect(await User.verifyPassword('pw', hash)).toBe(true);
    });
    it('returns false for mismatched plaintext', async () => {
      const hash = await bcrypt.hash('pw', 4);
      expect(await User.verifyPassword('wrong', hash)).toBe(false);
    });
  });
});
