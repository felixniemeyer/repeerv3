module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  testTimeout: 60000, // 60 seconds for integration tests
  setupFilesAfterEnv: ['<rootDir>/setup.ts'],
  maxWorkers: 1, // Prevent Jest worker circular JSON issues
};