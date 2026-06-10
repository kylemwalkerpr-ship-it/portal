// NOTE: `preset: 'ts-jest'` breaks under the pnpm layout (Jest's preset
// resolver can't see into node_modules/.pnpm), so we register the ts-jest
// transform explicitly via require.resolve — same behavior, robust to the
// package-manager layout. The old `globals['ts-jest']` block was also
// deprecated in ts-jest 29; options now live on the transform entry.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.next', '<rootDir>/.open-next'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          rootDir: '.',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          ignoreDeprecations: '6.0',
        },
      },
    ],
  },
}
