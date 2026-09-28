/**
 * E2E da camada de dados do app contra a API real do OpenDriver
 * (E2E_API_URL, ex.: http://localhost:5100). Usam exatamente createHttpClient,
 * createApi e o protocolo Socket.IO do app — só o storage de tokens é em memória.
 * E2E_DATABASE_URL (psql) aprova o motorista de teste, como faria o admin.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/e2e/**/*.e2e.test.ts'],
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testTimeout: 60_000,
};
