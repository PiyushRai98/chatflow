function errorHandler(err, req, res, _next) {
  console.error(`[${req.method} ${req.path}]`, err.stack || err.message);

  if (err.code === '23505') {
    // PostgreSQL unique constraint violation
    return res.status(409).json({ error: 'Resource already exists' });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const status = err.statusCode || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
