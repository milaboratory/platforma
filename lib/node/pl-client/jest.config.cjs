module.exports = {
  testEnvironment: '<rootDir>/src/jest.environment.ts',
  clearMocks: true,
  silent: false,
  detectOpenHandles: false,
  moduleFileExtensions: ['js', 'ts'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  verbose: true,
};
