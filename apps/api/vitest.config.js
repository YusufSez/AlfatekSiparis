import { defineConfig } from 'vitest/config';

const isCi = process.env.CI === 'true';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./tests/setupEnv.js'],
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30000,
    hookTimeout: 60000,
    reporters: isCi ? ['default', 'junit'] : ['default'],
    outputFile: isCi ? { junit: './test-results/junit.xml' } : undefined,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.js'],
      exclude: ['src/index.js'],
    },
  },
});
