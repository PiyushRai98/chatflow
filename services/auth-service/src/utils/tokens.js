const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../models/database');
const config = require('./config');

function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      type: 'access',
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiry }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function storeRefreshToken(userId, token, deviceInfo) {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, tokenHash, deviceInfo || 'unknown', expiresAt]
  );
}

async function verifyRefreshToken(token) {
  const tokenHash = hashToken(token);

  const result = await pool.query(
    `SELECT rt.id, rt.user_id, u.username
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1
       AND rt.expires_at > NOW()
       AND rt.revoked_at IS NULL`,
    [tokenHash]
  );

  return result.rows[0] || null;
}

async function revokeRefreshToken(token) {
  const tokenHash = hashToken(token);
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
    [tokenHash]
  );
}

async function revokeAllUserTokens(userId) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  storeRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
};
