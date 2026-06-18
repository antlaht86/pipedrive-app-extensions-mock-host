import { Command } from '@pipedrive/app-extensions-sdk';
import { afterEach, expect, test, vi } from 'vitest';
import { createHostEffects } from './host-effects.js';
import { createRouter, once } from './router.js';

// These tests drive the Message router and Command intake through their own
// seam — in-memory, with no window message and no forged MessageEvent. The
// host-effects are real, built over a jsdom shadow root exactly as the host
// builds them, so a dispatch is observed by its real effect (DOM + reply), not
// by spying on internal collaborators.

// A surface wrapper the host-effects can resolve and resize, torn down per test.
afterEach(() => {
  document
    .querySelectorAll(
      '.pd-mock-panel, .pd-mock-modal, .pd-mock-floating-window',
    )
    .forEach((el) => el.remove());
});

const makeHost = (config = {}) => {
  const el = document.createElement('div');
  const shadowRoot = el.attachShadow({ mode: 'open' });
  return createHostEffects({ shadowRoot, config });
};

test('dispatching GET_METADATA in-memory replies with the hosting window size', () => {
  const router = createRouter({ host: makeHost() });
  const reply = vi.fn();

  router.dispatch({ type: 'command', command: Command.GET_METADATA }, reply);

  expect(reply).toHaveBeenCalledWith({
    windowWidth: Math.round(window.innerWidth),
    windowHeight: Math.round(window.innerHeight),
  });
});

test('dispatching RESIZE within bounds resizes the active surface', () => {
  const panel = document.createElement('div');
  panel.className = 'pd-mock-panel';
  document.body.append(panel);

  const router = createRouter({ host: makeHost() });
  const reply = vi.fn();

  router.dispatch(
    { type: 'command', command: Command.RESIZE, args: { height: 400 } },
    reply,
  );

  expect(panel.style.height).toBe('400px');
  expect(reply).toHaveBeenCalled();
});

test('once forwards only the first reply and warns on a second', () => {
  const target = vi.fn();
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});

  const reply = once(target);
  reply({ first: true });
  reply({ second: true });

  expect(target).toHaveBeenCalledTimes(1);
  expect(target).toHaveBeenCalledWith({ first: true });
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

test('an unimplemented command still replies (never hangs the caller)', () => {
  const router = createRouter({ host: makeHost() });
  const reply = vi.fn();

  router.dispatch({ type: 'command', command: 'not_a_real_command' }, reply);

  expect(reply).toHaveBeenCalledWith({});
});

test('a track is recorded for inspection and never replied to', () => {
  const router = createRouter({ host: makeHost() });
  const reply = vi.fn();

  router.dispatch({ type: 'track', event: 'focused' }, reply);

  expect(router.getCalls()).toContainEqual({
    command: 'focused',
    args: undefined,
  });
  expect(reply).not.toHaveBeenCalled();
});

test('a registered listener receives a later emit', () => {
  const host = makeHost();
  const router = createRouter({ host });
  const port = { postMessage: vi.fn() } as unknown as MessagePort;

  router.dispatch(
    { type: 'listener', event: 'user_settings_change' },
    () => {},
    port,
  );
  host.events.emit('user_settings_change', { theme: 'dark' });

  expect(port.postMessage).toHaveBeenCalledWith({ data: { theme: 'dark' } });
});

test('a listener registration without a port is ignored, not recorded', () => {
  const router = createRouter({ host: makeHost() });

  expect(() =>
    router.dispatch(
      { type: 'listener', event: 'user_settings_change' },
      () => {},
    ),
  ).not.toThrow();
  expect(router.getCalls()).toHaveLength(0);
});

test('an unrecognized message type is ignored — no reply, not recorded', () => {
  const router = createRouter({ host: makeHost() });
  const reply = vi.fn();

  router.dispatch({ type: 'bogus' }, reply);

  expect(reply).not.toHaveBeenCalled();
  expect(router.getCalls()).toHaveLength(0);
});
