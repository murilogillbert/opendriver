/** Testes unitários (lógica pura, contexts, http core com fetch simulado). */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/unit/**/*.test.ts?(x)'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  setupFiles: ['<rootDir>/tests/unit/setup.ts'],
};
