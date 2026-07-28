import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/e2e/.*\\.e2e\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  testEnvironment: 'node',
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 30000,
};

export default config;
