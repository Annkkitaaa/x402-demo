import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/generate-wallet.ts'],
    },
    // Increase timeout for async blockchain operations
    testTimeout: 15_000,
  },
  resolve: {
    conditions: ['node'],
  },
});
