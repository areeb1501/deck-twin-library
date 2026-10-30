/**
 * Vitest config for the headless integration suite in tests/. Stands alone, so it does not read vite.config.ts
 * (no React plugin, proxy or build output): the suite imports src/ directly, in the node environment, with no
 * WebGL, no dev server and no .env files.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  envDir: false,
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // simulated hours run in beforeAll hooks, so a loaded CI runner needs the same margin there
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
