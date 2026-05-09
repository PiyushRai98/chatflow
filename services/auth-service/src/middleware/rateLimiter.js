const { RedisKeys } = require('@chat/types');

function createRateLimiter({ windowMs = 60000, max = 30, keyPrefix = 'default' }) {
  return async (req, res, next) => {
    const redis = req.app.locals.redis;
    if (!redis) return next(); // Skip if Redis unavailable in dev

    const identifier = req.user?.id || req.ip;
    const key = `${RedisKeys.RATE_LIMIT}${keyPrefix}:${identifier}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.pexpire(key, windowMs);
      }

      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - current)));

      if (current > max) {
        const ttl = await redis.pttl(key);
        res.set('Retry-After', String(Math.ceil(ttl / 1000)));
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: Math.ceil(ttl / 1000),
        });
      }

      next();
    } catch (err) {
      // Fail open — don't block requests if Redis is down
      console.error('[rate-limiter] Redis error:', err.message);
      next();
    }
  };
}

// Pre-configured limiters.
// In development we raise the ceilings so local iteration / smoke tests
// don't trip the limiter — production values are enforced via env overrides.
const isDev = process.env.NODE_ENV !== 'production';
const authLimiter = createRateLimiter({
  windowMs: 900000,
  max: isDev ? 100 : 10,   // 100/15min dev, 10/15min prod
  keyPrefix: 'auth',
});
const apiLimiter = createRateLimiter({
  windowMs: 60000,
  max: isDev ? 600 : 60,   // 600/min dev, 60/min prod
  keyPrefix: 'api',
});

module.exports = { createRateLimiter, authLimiter, apiLimiter };
