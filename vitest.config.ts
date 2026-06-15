import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The mock renders real DOM elements, so tests run in a browser-like env.
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
