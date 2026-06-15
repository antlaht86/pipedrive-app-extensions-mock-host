import * as sdkModule from '@pipedrive/app-extensions-sdk';
import { within } from '@testing-library/dom';
import { afterEach, expect, test } from 'vitest';
import { startPipedriveMockHost, type MockHost } from './index.js';

// The SDK is CJS (`exports.default = class` + `__esModule`). Depending on the
// bundler's interop, the default import is either the class itself or the
// module namespace whose `.default` is the class — normalize both.
const defaultExport = (sdkModule as { default: unknown }).default;
const AppExtensionsSDK = (
  typeof defaultExport === 'function'
    ? defaultExport
    : (defaultExport as { default: unknown }).default
) as new (options?: { identifier?: string; targetWindow?: Window }) => {
  initialize(): Promise<{ execute: (...args: unknown[]) => Promise<unknown> }>;
};
const { Command } = sdkModule;

let host: MockHost | undefined;

afterEach(() => {
  host?.teardown();
  host = undefined;
  // Remove any stray host elements left by tests that start more than one.
  document.querySelectorAll('pipedrive-mock-host').forEach((el) => el.remove());
});

// The real SDK posts to `targetWindow` over a MessageChannel; port transfer only
// works in a real browser, so these tests run in the browser project. Vitest
// browser mode runs tests inside an iframe (window.parent !== window), so we
// point the SDK at `window` explicitly — the Mock Host always listens on `window`.
function createSdk() {
  return new AppExtensionsSDK({
    identifier: 'dev-local',
    targetWindow: window,
  }).initialize();
}

test('initialize() resolves once the host answers the INITIALIZE handshake', async () => {
  host = startPipedriveMockHost();

  const sdk = await createSdk();

  expect(sdk).toBeDefined();
});

test('SHOW_SNACKBAR renders a snackbar with the given message', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  await sdk.execute(Command.SHOW_SNACKBAR, { message: 'Deal saved!' });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  expect(ui.getByText('Deal saved!')).toBeVisible();
});

test('SHOW_SNACKBAR renders the optional action link', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  await sdk.execute(Command.SHOW_SNACKBAR, {
    message: 'Deal saved!',
    link: { url: 'https://example.com/deals/1', label: 'View' },
  });

  const link = within(host.shadowRoot as unknown as HTMLElement).getByRole(
    'link',
    { name: 'View' },
  );
  expect(link).toHaveAttribute('href', 'https://example.com/deals/1');
});

test('the snackbar is visibly marked as a mock', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  await sdk.execute(Command.SHOW_SNACKBAR, { message: 'Deal saved!' });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  expect(ui.getByText('MOCK')).toBeVisible();
});

test('an unimplemented command resolves to an object, not undefined', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  // SHOW_CONFIRMATION is not implemented yet. Its result must be an object so
  // that consumer code destructuring it (e.g. `const { confirmed } = ...`) does
  // not throw on `undefined`.
  const result = await sdk.execute(Command.SHOW_CONFIRMATION, {
    title: 'Delete?',
  });

  expect(result).toEqual({});
});

test('starting twice without teardown reuses the single host', () => {
  host = startPipedriveMockHost();

  startPipedriveMockHost();

  expect(document.querySelectorAll('pipedrive-mock-host')).toHaveLength(1);
});

// Custom Panel surface wrapper (see ADR-0005).

function renderPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'pd-mock-panel';
  document.body.appendChild(panel);
  return panel;
}

afterEach(() => {
  document.querySelectorAll('.pd-mock-panel').forEach((el) => el.remove());
});

test('a .pd-mock-panel wrapper gets the fixed panel width', async () => {
  host = startPipedriveMockHost();

  const panel = renderPanel();

  expect(panel.offsetWidth).toBe(385);
});

test('RESIZE sets the panel height within the allowed range', async () => {
  host = startPipedriveMockHost();
  const panel = renderPanel();
  const sdk = await createSdk();

  await sdk.execute(Command.RESIZE, { height: 400 });

  expect(panel.offsetHeight).toBe(400);
});

test('RESIZE clamps the panel height to the 100–750px range', async () => {
  host = startPipedriveMockHost();
  const panel = renderPanel();
  const sdk = await createSdk();

  await sdk.execute(Command.RESIZE, { height: 900 });
  expect(panel.offsetHeight).toBe(750);

  await sdk.execute(Command.RESIZE, { height: 40 });
  expect(panel.offsetHeight).toBe(100);
});

test('RESIZE ignores width — the panel stays at the fixed width', async () => {
  host = startPipedriveMockHost();
  const panel = renderPanel();
  const sdk = await createSdk();

  await sdk.execute(Command.RESIZE, { width: 600, height: 300 });

  expect(panel.offsetWidth).toBe(385);
});

test('GET_METADATA returns the panel surface dimensions', async () => {
  host = startPipedriveMockHost();
  renderPanel();
  const sdk = await createSdk();
  await sdk.execute(Command.RESIZE, { height: 300 });

  const meta = await sdk.execute(Command.GET_METADATA);

  expect(meta).toEqual({ windowWidth: 385, windowHeight: 300 });
});
