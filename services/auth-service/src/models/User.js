const { pool } = require('./database');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

const User = {
  async create({ username, email, password, displayName }) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, display_name, avatar_url, bio, status, created_at`,
      [username, email, passwordHash, displayName]
    );
    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await pool.query(
      `SELECT id, username, email, password_hash, display_name, avatar_url, bio, status, last_seen_at, created_at
       FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0] || null;
  },

  async findByUsername(username) {
    const result = await pool.query(
      `SELECT id, username, email, password_hash, display_name, avatar_url, bio, status, last_seen_at, created_at
       FROM users WHERE username = $1`,
      [username]
    );
    return result.rows[0] || null;
  },

  async findById(id) {
    const result = await pool.query(
      `SELECT id, username, email, display_name, avatar_url, bio, status, last_seen_at, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async updateProfile(id, { displayName, avatarUrl, bio }) {
    const fields = [];
    const values = [];
    let paramIdx = 1;

    if (displayName !== undefined) {
      fields.push(`display_name = $${paramIdx++}`);
      values.push(displayName);
    }
    if (avatarUrl !== undefined) {
      fields.push(`avatar_url = $${paramIdx++}`);
      values.push(avatarUrl);
    }
    if (bio !== undefined) {
      fields.push(`bio = $${paramIdx++}`);
      values.push(bio);
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIdx}
       RETURNING id, username, email, display_name, avatar_url, bio, status, created_at`,
      values
    );
    return result.rows[0] || null;
  },

  async updateStatus(id, status) {
    await pool.query(
      `UPDATE users SET status = $1, last_seen_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
  },

  async search(query, limit = 20) {
    const result = await pool.query(
      `SELECT id, username, display_name, avatar_url, status
       FROM users
       WHERE username ILIKE $1 OR display_name ILIKE $1
       LIMIT $2`,
      [`%${query}%`, limit]
    );
    return result.rows;
  },

  async verifyPassword(plaintext, hash) {
    return bcrypt.compare(plaintext, hash);
  },
};

module.exports = User;
