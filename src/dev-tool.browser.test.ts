import { afterEach, expect, test } from 'vitest';
import { startPipedriveMockHost, type MockHost } from './index.js';

// Surface gating is a *visual* rule (controls hidden via CSS), so it must run in
// the real-browser project: jsdom does not apply the injected stylesheet to
// computed style, which is exactly how the regression — a class rule overriding
// the `[hidden]` UA rule — slipped past the jsdom unit tests.

let host: MockHost | undefined;

afterEach(() => {
  host?.teardown();
  host = undefined;
  document
    .querySelectorAll(
      '.pd-mock-panel, .pd-mock-modal, .pd-mock-floating-window',
    )
    .forEach((el) => el.remove());
});

test('focus-mode and floating-window controls are not visible on a panel', () => {
  const panel = document.createElement('div');
  panel.className = 'pd-mock-panel';
  document.body.append(panel);

  host = startPipedriveMockHost();

  expect(
    host.shadowRoot.querySelector<HTMLElement>(
      'button[aria-label="Toggle focus mode"]',
    ),
  ).not.toBeVisible();
  expect(
    host.shadowRoot.querySelector<HTMLElement>(
      'button[aria-label="Toggle floating window visibility"]',
    ),
  ).not.toBeVisible();
});

test('focus-mode and floating-window controls are visible on a floating window', () => {
  const fw = document.createElement('div');
  fw.className = 'pd-mock-floating-window';
  document.body.append(fw);

  host = startPipedriveMockHost();

  expect(
    host.shadowRoot.querySelector<HTMLElement>(
      'button[aria-label="Toggle focus mode"]',
    ),
  ).toBeVisible();
  expect(
    host.shadowRoot.querySelector<HTMLElement>(
      'button[aria-label="Toggle floating window visibility"]',
    ),
  ).toBeVisible();
});
