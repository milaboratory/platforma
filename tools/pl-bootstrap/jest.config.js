module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  verbose: true,
  modulePathIgnorePatterns: [
    '<rootDir>/src/commands/test.ts',
    '<rootDir>/dist/commands/test.js',
  ]
};
