import { afterEach, expect, test } from 'vitest';
import { startPipedriveMockHost } from './index.js';

// Dev Tool behaviour (ADR-0009, docs/plans/2026-06-16-dev-tool-design.md). These
// are DOM-structure tests, so they run in the jsdom unit project; event delivery
// to a real SDK listener is covered separately in the browser project.

afterEach(() => {
  document.querySelectorAll('pipedrive-mock-host').forEach((el) => el.remove());
});

test('renders the dev tool into the shadow root by default', () => {
  const host = startPipedriveMockHost();

  const devTool = host.shadowRoot.querySelector(
    '[aria-label="Mock host dev tool"]',
  );
  expect(devTool).not.toBeNull();

  host.teardown();
});

test('devTool: false renders no dev tool', () => {
  const host = startPipedriveMockHost({ devTool: false });

  expect(
    host.shadowRoot.querySelector('[aria-label="Mock host dev tool"]'),
  ).toBeNull();

  host.teardown();
});

test('emitting an event adds an Event entry to the Active Log', () => {
  const host = startPipedriveMockHost();

  host.emit('user_settings_change', { theme: 'dark' });

  const log = host.shadowRoot.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('user_settings_change');
  expect(log?.textContent).toContain('dark');

  host.teardown();
});

test('a track the app sends appears in the Active Log', () => {
  const host = startPipedriveMockHost();

  window.dispatchEvent(
    new MessageEvent('message', {
      data: { payload: { type: 'track', event: 'focused' } },
    }),
  );

  const log = host.shadowRoot.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('focused');

  host.teardown();
});

test('a command the app sends appears in the Active Log', () => {
  const host = startPipedriveMockHost();

  window.dispatchEvent(
    new MessageEvent('message', {
      data: { payload: { type: 'command', command: 'get_metadata' } },
    }),
  );

  const log = host.shadowRoot.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('get_metadata');

  host.teardown();
});

test('devTool.position anchors the dev tool to the given corner', () => {
  const host = startPipedriveMockHost({
    devTool: { position: 'bottom-right' },
  });

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  expect(tool?.getAttribute('data-position')).toBe('bottom-right');

  host.teardown();
});

test('host.devTool.setPosition moves the dev tool at runtime', () => {
  const host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  expect(tool?.getAttribute('data-position')).toBe('bottom-left');

  host.devTool.setPosition('top-right');
  expect(tool?.getAttribute('data-position')).toBe('top-right');

  host.teardown();
});

test('devTool defaults to the bottom-left corner', () => {
  const host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  expect(tool?.getAttribute('data-position')).toBe('bottom-left');

  host.teardown();
});

test('the dev tool can be collapsed and expanded via its toggle', () => {
  const host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const toggle = tool?.querySelector<HTMLButtonElement>(
    'button[aria-expanded]',
  );

  expect(toggle?.getAttribute('aria-expanded')).toBe('true');

  toggle?.click();
  expect(toggle?.getAttribute('aria-expanded')).toBe('false');

  toggle?.click();
  expect(toggle?.getAttribute('aria-expanded')).toBe('true');

  host.teardown();
});
