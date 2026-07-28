import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/e2e/.*\\.e2e\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { diagnostics: false }] },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/e2e/env-setup.ts'],
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 30000,
};

export default config;
