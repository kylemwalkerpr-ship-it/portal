module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.next', '<rootDir>/.open-next'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        rootDir: '.',
        module: 'commonjs',
        moduleResolution: 'node',
        esModuleInterop: true,
        ignoreDeprecations: '6.0',
      },
    },
  },
}
