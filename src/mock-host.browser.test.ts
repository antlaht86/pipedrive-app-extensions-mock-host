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
