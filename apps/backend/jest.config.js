/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/test-env-setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  testTimeout: 30000,
};


