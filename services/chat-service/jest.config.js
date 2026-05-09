module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/index.js'],
  clearMocks: true,
  testTimeout: 15000,
  // Force exit to avoid lingering socket.io timers between suites
  forceExit: true,
  detectOpenHandles: false,
};
