const jwt = require('jsonwebtoken');
const config = require('../utils/config');

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    socket.userId = payload.sub;
    socket.username = payload.username;
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
}

module.exports = { socketAuthMiddleware };
