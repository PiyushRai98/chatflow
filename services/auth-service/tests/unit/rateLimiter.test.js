/**
 * Unit tests for the Redis-backed rate limiter middleware.
 * Contract under test:
 *   - First hit within window sets TTL
 *   - Subsequent hits increment without resetting TTL
 *   - When count exceeds max, respond 429 with Retry-After
 *   - When Redis throws, fail open (allow request through)
 *   - When no Redis on app.locals, skip entirely
 */
jest.mock('@chat/types', () => ({
  RedisKeys: { RATE_LIMIT: 'rl:' },
}), { virtual: true });

const { createRateLimiter } = require('../../src/middleware/rateLimiter');

function makeReq({ redis, userId, ip = '1.2.3.4' } = {}) {
  return {
    app: { locals: { redis } },
    user: userId ? { id: userId } : undefined,
    ip,
  };
}

function makeRes() {
  const headers = {};
  return {
    _headers: headers,
    _status: 200,
    _json: null,
    set: jest.fn((k, v) => { headers[k] = v; }),
    status: jest.fn(function (code) { this._status = code; return this; }),
    json: jest.fn(function (body) { this._json = body; return this; }),
  };
}

describe('rateLimiter middleware', () => {
  it('passes through when Redis is not attached (dev fallback)', async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, keyPrefix: 't' });
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    await limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('on first request sets pexpire and returns with remaining=max-1', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(1),
      pexpire: jest.fn().mockResolvedValue(1),
      pttl: jest.fn(),
    };
    const limiter = createRateLimiter({ max: 5, windowMs: 60000, keyPrefix: 'auth' });
    const req = makeReq({ redis, ip: '9.9.9.9' });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req, res, next);

    expect(redis.incr).toHaveBeenCalledWith('rl:auth:9.9.9.9');
    expect(redis.pexpire).toHaveBeenCalledWith('rl:auth:9.9.9.9', 60000);
    expect(res._headers['X-RateLimit-Limit']).toBe('5');
    expect(res._headers['X-RateLimit-Remaining']).toBe('4');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not reset TTL on subsequent requests', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(3),
      pexpire: jest.fn(),
      pttl: jest.fn(),
    };
    const limiter = createRateLimiter({ max: 5, windowMs: 60000 });
    const req = makeReq({ redis });
    await limiter(req, makeRes(), jest.fn());
    expect(redis.pexpire).not.toHaveBeenCalled();
  });

  it('blocks with 429 and Retry-After once max is exceeded', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(11),
      pexpire: jest.fn(),
      pttl: jest.fn().mockResolvedValue(42000),
    };
    const limiter = createRateLimiter({ max: 10, windowMs: 60000 });
    const req = makeReq({ redis });
    const res = makeRes();
    const next = jest.fn();

    await limiter(req, res, next);

    expect(res._status).toBe(429);
    expect(res._headers['Retry-After']).toBe('42');
    expect(res._json).toMatchObject({ error: 'Too many requests', retryAfter: 42 });
    expect(next).not.toHaveBeenCalled();
  });

  it('prefers req.user.id over ip as identifier when authenticated', async () => {
    const redis = { incr: jest.fn().mockResolvedValue(1), pexpire: jest.fn(), pttl: jest.fn() };
    const limiter = createRateLimiter({ keyPrefix: 'api', max: 60, windowMs: 60000 });
    await limiter(makeReq({ redis, userId: 'u-42', ip: '1.2.3.4' }), makeRes(), jest.fn());
    expect(redis.incr).toHaveBeenCalledWith('rl:api:u-42');
  });

  it('fails open (calls next) when Redis throws', async () => {
    const redis = {
      incr: jest.fn().mockRejectedValue(new Error('Connection refused')),
      pexpire: jest.fn(),
      pttl: jest.fn(),
    };
    const limiter = createRateLimiter({ max: 10, windowMs: 60000 });
    const next = jest.fn();
    // swallow expected error log
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await limiter(makeReq({ redis }), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
