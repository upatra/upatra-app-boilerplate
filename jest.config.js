const tsTransform = {
  '^.+\\.(ts|tsx)$': ['ts-jest', {
    tsconfig: { jsx: 'react-jsx' },
    useESM: true,
  }],
};

export default {
  projects: [
    // ── Unit tests (pure logic, no DOM) ────────────────────────────────────
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
      transform: tsTransform,
      extensionsToTreatAsEsm: ['.ts'],
    },
    // ── Integration tests (React component tests with mocked API) ─────────
    {
      displayName: 'integration',
      testEnvironment: '<rootDir>/src/test/customJsdomEnvironment.cjs',
      testMatch: ['<rootDir>/src/__tests__/**/*.test.tsx'],
      transform: tsTransform,
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs', 'jsx', 'cjs'],
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
      moduleNameMapper: {
        // Shim CJS packages that don't provide ESM named exports. Use the
        // .ts shim — under ESM jest cannot reliably read named exports from
        // a CJS file via cjs-module-lexer, but the .ts re-export bridge
        // works because ts-jest emits real ESM exports.
        '^humps$': '<rootDir>/src/test/shims/humps.ts',
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  ],
};
