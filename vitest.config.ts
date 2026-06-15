import { defaultExclude, defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

/** Tests named `*.browser.test.ts` run in a real browser; the rest in jsdom. */
const browserPattern = '**/*.browser.test.ts';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      {
        // Fast unit/logic tests in a lightweight DOM.
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.ts'],
          exclude: [`src/${browserPattern}`, ...defaultExclude],
        },
      },
      {
        // UI component tests in a real browser: true layout, focus,
        // z-index, CSS and events — things jsdom cannot model.
        extends: true,
        test: {
          name: 'browser',
          include: [`src/${browserPattern}`],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
