import { expect, test } from 'vitest';
import { createActiveLog } from './active-log.js';

// Standalone tests for the Active Log seam — constructed directly, no host. The
// Message router, Event push and the Dev Tool all write through this `write`.

test('write prepends entries newest-first', () => {
  const log = createActiveLog();

  log.write('app → host', 'command', 'first');
  log.write('app → host', 'command', 'second');

  const items = log.element.querySelectorAll('li');
  expect(items).toHaveLength(2);
  expect(items[0]?.textContent).toContain('second');
  expect(items[1]?.textContent).toContain('first');
});

test('write formats direction, kind, name and a JSON payload', () => {
  const log = createActiveLog();

  log.write('host → app', 'event', 'user_settings_change', { theme: 'dark' });

  expect(log.element.textContent).toBe(
    'host → app event: user_settings_change {"theme":"dark"}',
  );
});

test('write omits the detail when there is no payload', () => {
  const log = createActiveLog();

  log.write('app → host', 'track', 'focused');

  expect(log.element.textContent).toBe('app → host track: focused');
});

test('the element starts as an empty list labelled "Active log"', () => {
  const log = createActiveLog();

  expect(log.element.tagName).toBe('UL');
  expect(log.element.getAttribute('aria-label')).toBe('Active log');
  expect(log.element.children).toHaveLength(0);
});
