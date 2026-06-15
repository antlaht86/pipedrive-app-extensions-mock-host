import * as sdkModule from '@pipedrive/app-extensions-sdk';
import { within } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';
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

  // CLOSE_MODAL is not implemented yet. Its result must be an object so that
  // consumer code destructuring it does not throw on `undefined`.
  const result = await sdk.execute(Command.CLOSE_MODAL);

  expect(result).toEqual({});
});

test('starting twice without teardown reuses the single host', () => {
  host = startPipedriveMockHost();

  startPipedriveMockHost();

  expect(document.querySelectorAll('pipedrive-mock-host')).toHaveLength(1);
});

test('GET_SIGNED_TOKEN returns a default dev token', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  const result = await sdk.execute(Command.GET_SIGNED_TOKEN);

  expect(result).toEqual({ token: 'dev-signed-token' });
});

test('GET_SIGNED_TOKEN uses config.getSignedToken when provided', async () => {
  host = startPipedriveMockHost({ getSignedToken: () => 'my-dev-jwt' });
  const sdk = await createSdk();

  const result = await sdk.execute(Command.GET_SIGNED_TOKEN);

  expect(result).toEqual({ token: 'my-dev-jwt' });
});

test('GET_SIGNED_TOKEN awaits an async getSignedToken', async () => {
  host = startPipedriveMockHost({
    getSignedToken: () => Promise.resolve('async-jwt'),
  });
  const sdk = await createSdk();

  const result = await sdk.execute(Command.GET_SIGNED_TOKEN);

  expect(result).toEqual({ token: 'async-jwt' });
});

test('GET_SIGNED_TOKEN falls back to the default token when getSignedToken throws', async () => {
  host = startPipedriveMockHost({
    getSignedToken: () => {
      throw new Error('boom');
    },
  });
  const sdk = await createSdk();

  const result = await sdk.execute(Command.GET_SIGNED_TOKEN);

  expect(result).toEqual({ token: 'dev-signed-token' });
});

test('SHOW_CONFIRMATION resolves via config.onConfirmation without UI', async () => {
  host = startPipedriveMockHost({ onConfirmation: () => true });
  const sdk = await createSdk();

  const result = await sdk.execute(Command.SHOW_CONFIRMATION, {
    title: 'Delete this deal?',
  });

  expect(result).toEqual({ confirmed: true });
});

test('SHOW_CONFIRMATION resolves to false when onConfirmation throws', async () => {
  host = startPipedriveMockHost({
    onConfirmation: () => {
      throw new Error('boom');
    },
  });
  const sdk = await createSdk();

  const result = await sdk.execute(Command.SHOW_CONFIRMATION, {
    title: 'Delete?',
  });

  expect(result).toEqual({ confirmed: false });
});

test('SHOW_CONFIRMATION renders a dialog with the title when not overridden', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  // Not awaited: the dialog stays open until the user answers.
  void sdk.execute(Command.SHOW_CONFIRMATION, { title: 'Delete this deal?' });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  expect(await ui.findByText('Delete this deal?')).toBeVisible();
});

test('clicking OK resolves SHOW_CONFIRMATION with confirmed: true', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  const resultPromise = sdk.execute(Command.SHOW_CONFIRMATION, {
    title: 'Delete this deal?',
  });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  await userEvent.click(await ui.findByRole('button', { name: 'OK' }));

  expect(await resultPromise).toEqual({ confirmed: true });
});

test('clicking Cancel resolves SHOW_CONFIRMATION with confirmed: false', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  const resultPromise = sdk.execute(Command.SHOW_CONFIRMATION, {
    title: 'Delete this deal?',
  });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  await userEvent.click(await ui.findByRole('button', { name: 'Cancel' }));

  expect(await resultPromise).toEqual({ confirmed: false });
});

test('SHOW_CONFIRMATION renders the optional description', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  void sdk.execute(Command.SHOW_CONFIRMATION, {
    title: 'Delete this deal?',
    description: 'This cannot be undone.',
  });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  expect(await ui.findByText('This cannot be undone.')).toBeVisible();
});

test('SHOW_CONFIRMATION uses custom okText and cancelText labels', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  void sdk.execute(Command.SHOW_CONFIRMATION, {
    title: 'Delete this deal?',
    okText: 'Delete',
    cancelText: 'Keep',
  });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  expect(await ui.findByRole('button', { name: 'Delete' })).toBeVisible();
  expect(ui.getByRole('button', { name: 'Keep' })).toBeVisible();
});

// Custom Panel surface wrapper (see ADR-0005).

function renderSurface(className: string): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  document.body.appendChild(el);
  return el;
}

function renderPanel(): HTMLElement {
  return renderSurface('pd-mock-panel');
}

afterEach(() => {
  document
    .querySelectorAll(
      '.pd-mock-panel, .pd-mock-modal, .pd-mock-floating-window',
    )
    .forEach((el) => el.remove());
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

// Custom Modal surface wrapper (see ADR-0006).

test('a .pd-mock-modal wrapper gets the default modal size', async () => {
  host = startPipedriveMockHost();

  const modal = renderSurface('pd-mock-modal');

  expect([modal.offsetWidth, modal.offsetHeight]).toEqual([520, 400]);
});

test('RESIZE clamps the modal width to at least 320px', async () => {
  host = startPipedriveMockHost();
  const modal = renderSurface('pd-mock-modal');
  const sdk = await createSdk();

  await sdk.execute(Command.RESIZE, { width: 100, height: 300 });

  expect(modal.offsetWidth).toBe(320);
});

test('RESIZE clamps the modal height to at least 120px', async () => {
  host = startPipedriveMockHost();
  const modal = renderSurface('pd-mock-modal');
  const sdk = await createSdk();

  await sdk.execute(Command.RESIZE, { width: 400, height: 50 });

  expect(modal.offsetHeight).toBe(120);
});

test('RESIZE clamps the modal size to the viewport', async () => {
  host = startPipedriveMockHost();
  const modal = renderSurface('pd-mock-modal');
  const sdk = await createSdk();

  await sdk.execute(Command.RESIZE, { width: 9000, height: 9000 });

  expect(modal.offsetWidth).toBe(window.innerWidth);
  expect(modal.offsetHeight).toBe(window.innerHeight);
});

// Floating Window surface wrapper (see ADR-0006).

test('a .pd-mock-floating-window wrapper gets the default floating size', async () => {
  host = startPipedriveMockHost();

  const fw = renderSurface('pd-mock-floating-window');

  expect([fw.offsetWidth, fw.offsetHeight]).toEqual([320, 240]);
});

test('RESIZE clamps the floating window width to 200–800px', async () => {
  host = startPipedriveMockHost();
  const fw = renderSurface('pd-mock-floating-window');
  const sdk = await createSdk();

  await sdk.execute(Command.RESIZE, { width: 100, height: 240 });
  expect(fw.offsetWidth).toBe(200);

  await sdk.execute(Command.RESIZE, { width: 9000, height: 240 });
  expect(fw.offsetWidth).toBe(800);
});

test('RESIZE clamps the floating window height to 70–700px', async () => {
  host = startPipedriveMockHost();
  const fw = renderSurface('pd-mock-floating-window');
  const sdk = await createSdk();

  await sdk.execute(Command.RESIZE, { width: 320, height: 30 });
  expect(fw.offsetHeight).toBe(70);

  await sdk.execute(Command.RESIZE, { width: 320, height: 9000 });
  expect(fw.offsetHeight).toBe(700);
});

test('GET_METADATA returns the modal surface dimensions', async () => {
  host = startPipedriveMockHost();
  renderSurface('pd-mock-modal');
  const sdk = await createSdk();
  // Use the modal minimum, always within the test viewport.
  await sdk.execute(Command.RESIZE, { width: 320, height: 120 });

  const meta = await sdk.execute(Command.GET_METADATA);

  expect(meta).toEqual({ windowWidth: 320, windowHeight: 120 });
});

test('GET_METADATA returns the floating window dimensions', async () => {
  host = startPipedriveMockHost();
  renderSurface('pd-mock-floating-window');
  const sdk = await createSdk();
  await sdk.execute(Command.RESIZE, { width: 400, height: 300 });

  const meta = await sdk.execute(Command.GET_METADATA);

  expect(meta).toEqual({ windowWidth: 400, windowHeight: 300 });
});
