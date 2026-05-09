module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/models/database.js',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 75, lines: 80, statements: 80 },
  },
  clearMocks: true,
  testTimeout: 10000,
};
