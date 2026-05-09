const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// All user routes require authentication
router.use(authenticateToken);
router.use(apiLimiter);

// GET /api/users/me
router.get('/me', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/me
router.patch('/me', [
  body('displayName').optional().trim().isLength({ min: 1, max: 100 }),
  body('avatarUrl').optional().isURL(),
  body('bio').optional().trim().isLength({ max: 500 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updated = await User.updateProfile(req.user.id, {
      displayName: req.body.displayName,
      avatarUrl: req.body.avatarUrl,
      bio: req.body.bio,
    });

    if (!updated) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    res.json({ user: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/search?q=john
router.get('/search', [
  query('q').trim().isLength({ min: 1, max: 50 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const users = await User.search(req.query.q);
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
