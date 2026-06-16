import * as sdkModule from '@pipedrive/app-extensions-sdk';
import { within } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { startPipedriveMockHost, type MockHost } from './index.js';

/** Let queued postMessage/MessageChannel deliveries run. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

// The SDK is CJS (`exports.default = class` + `__esModule`). Depending on the
// bundler's interop, the default import is either the class itself or the
// module namespace whose `.default` is the class — normalize both.
const defaultExport = (sdkModule as { default: unknown }).default;
const AppExtensionsSDK = (
  typeof defaultExport === 'function'
    ? defaultExport
    : (defaultExport as { default: unknown }).default
) as new (options?: { identifier?: string; targetWindow?: Window }) => {
  initialize(initOptions?: {
    size?: { width?: number; height?: number };
  }): Promise<{
    execute: (...args: unknown[]) => Promise<unknown>;
    listen: (
      event: string,
      cb: (response: { data?: unknown; error?: string }) => void,
    ) => () => void;
  }>;
};
const { Command, Event } = sdkModule;

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

// Events: the host pushes to listeners via emit (see ADR-0001 / design plan).

test('host.emit delivers an event to a matching listener', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();
  const received: Array<{ data?: unknown }> = [];

  sdk.listen(Event.VISIBILITY, (response) => received.push(response));
  await tick(); // let the host register the listener port

  host.emit(Event.VISIBILITY, { is_visible: false });

  await vi.waitFor(() =>
    expect(received).toEqual([{ data: { is_visible: false } }]),
  );
});

test('host.emit only notifies listeners of the matching event', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();
  const visibility: Array<{ data?: unknown }> = [];
  const settings: Array<{ data?: unknown }> = [];

  sdk.listen(Event.VISIBILITY, (r) => visibility.push(r));
  sdk.listen(Event.USER_SETTINGS_CHANGE, (r) => settings.push(r));
  await tick();

  host.emit(Event.USER_SETTINGS_CHANGE, { theme: 'dark' });

  await vi.waitFor(() =>
    expect(settings).toEqual([{ data: { theme: 'dark' } }]),
  );
  expect(visibility).toEqual([]);
});

test('the unsubscribe function stops further events', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();
  const received: Array<{ data?: unknown }> = [];

  const off = sdk.listen(Event.VISIBILITY, (r) => received.push(r));
  await tick();
  off();
  await tick();

  host.emit(Event.VISIBILITY, { is_visible: true });
  await tick();
  await tick();

  expect(received).toEqual([]);
});

// Notification badge (SET_NOTIFICATION).

test('SET_NOTIFICATION shows the notification count', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  await sdk.execute(Command.SET_NOTIFICATION, { number: 3 });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  expect(ui.getByText('3')).toBeVisible();
});

// Focus mode (SET_FOCUS_MODE).

test('SET_FOCUS_MODE toggles a focus-mode indicator', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();
  const ui = within(host.shadowRoot as unknown as HTMLElement);

  await sdk.execute(Command.SET_FOCUS_MODE, true);
  expect(ui.getByText('Focus mode')).toBeVisible();

  await sdk.execute(Command.SET_FOCUS_MODE, false);
  expect(ui.queryByText('Focus mode')).toBeNull();
});

// Redirect (REDIRECT_TO).

test('REDIRECT_TO shows where it would navigate', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  await sdk.execute(Command.REDIRECT_TO, { view: 'deals' });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  expect(ui.getByText('Redirect → deals')).toBeVisible();
});

// Floating window visibility (SHOW/HIDE_FLOATING_WINDOW).

test('HIDE_FLOATING_WINDOW hides the floating window and SHOW reveals it', async () => {
  host = startPipedriveMockHost();
  const fw = renderSurface('pd-mock-floating-window');
  const sdk = await createSdk();

  await sdk.execute(Command.HIDE_FLOATING_WINDOW, {});
  expect(fw).not.toBeVisible();

  await sdk.execute(Command.SHOW_FLOATING_WINDOW, {});
  expect(fw).toBeVisible();
});

// Modals (OPEN_MODAL / CLOSE_MODAL).

test('OPEN_MODAL resolves via config.onModal without UI', async () => {
  host = startPipedriveMockHost({
    onModal: () => ({ status: 'submitted', id: 42 }),
  });
  const sdk = await createSdk();

  const result = await sdk.execute(Command.OPEN_MODAL, { type: 'deal' });

  expect(result).toEqual({ status: 'submitted', id: 42 });
});

test('OPEN_MODAL renders a modal; Submit resolves submitted with an id', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  const resultPromise = sdk.execute(Command.OPEN_MODAL, { type: 'deal' });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  await userEvent.click(await ui.findByRole('button', { name: 'Submit' }));

  expect(await resultPromise).toEqual({ status: 'submitted', id: 1 });
});

test('OPEN_MODAL Close resolves closed without an id', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  const resultPromise = sdk.execute(Command.OPEN_MODAL, { type: 'person' });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  await userEvent.click(await ui.findByRole('button', { name: 'Close' }));

  expect(await resultPromise).toEqual({ status: 'closed' });
});

test('CLOSE_MODAL dismisses the open modal and resolves it closed', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  const resultPromise = sdk.execute(Command.OPEN_MODAL, { type: 'deal' });
  const ui = within(host.shadowRoot as unknown as HTMLElement);
  await ui.findByRole('dialog');

  await sdk.execute(Command.CLOSE_MODAL);

  expect(await resultPromise).toEqual({ status: 'closed' });
  expect(ui.queryByRole('dialog')).toBeNull();
});

test('OPEN_MODAL renders the prefill values it received', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  void sdk.execute(Command.OPEN_MODAL, {
    type: 'activity',
    prefill: { subject: 'Follow-up phone call' },
  });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  await ui.findByRole('dialog');
  expect(ui.getByText('subject')).toBeTruthy();
  expect(ui.getByText('Follow-up phone call')).toBeTruthy();
});

test('OPEN_MODAL shows HTML in a prefill value as literal text, not markup', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  void sdk.execute(Command.OPEN_MODAL, {
    type: 'activity',
    prefill: { note: 'Ask about <b>deal next steps</b>' },
  });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  const dialog = await ui.findByRole('dialog');
  // The angle brackets are shown verbatim and no <b> element is created.
  expect(ui.getByText('Ask about <b>deal next steps</b>')).toBeTruthy();
  expect(dialog.querySelector('b')).toBeNull();
});

test('OPEN_MODAL shows "(no prefill)" when no prefill was given', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();

  void sdk.execute(Command.OPEN_MODAL, { type: 'deal' });

  const ui = within(host.shadowRoot as unknown as HTMLElement);
  await ui.findByRole('dialog');
  expect(ui.getByText('(no prefill)')).toBeTruthy();
});

test('OPEN_MODAL custom_modal renders an iframe to the configured URL', async () => {
  host = startPipedriveMockHost({
    customModals: { settings: 'https://example.com/modals/settings' },
  });
  const sdk = await createSdk();

  void sdk.execute(Command.OPEN_MODAL, {
    type: 'custom_modal',
    action_id: 'settings',
  });

  await vi.waitFor(() => {
    const iframe = (host!.shadowRoot as ShadowRoot).querySelector('iframe');
    expect(iframe).toHaveAttribute(
      'src',
      'https://example.com/modals/settings',
    );
  });
});

test('closing a custom_modal fires CLOSE_CUSTOM_MODAL', async () => {
  host = startPipedriveMockHost({
    customModals: { x: 'https://example.com/x' },
  });
  const sdk = await createSdk();
  const closed: Array<{ data?: unknown }> = [];
  sdk.listen(Event.CLOSE_CUSTOM_MODAL, (r) => closed.push(r));
  await tick();

  void sdk.execute(Command.OPEN_MODAL, {
    type: 'custom_modal',
    action_id: 'x',
  });
  const ui = within(host.shadowRoot as unknown as HTMLElement);
  await userEvent.click(await ui.findByRole('button', { name: 'Close' }));

  await vi.waitFor(() => expect(closed).toHaveLength(1));
});

// Tracking (FOCUSED).

test('the host records the FOCUSED track the SDK sends on focus', async () => {
  host = startPipedriveMockHost();
  await createSdk();

  // The SDK fires FOCUSED on the first focus; blur first so focus re-triggers
  // regardless of whether the test window was already focused.
  // Note: the SDK's `Event` enum shadows the DOM Event constructor here, so use
  // FocusEvent for the focus/blur dispatch.
  window.dispatchEvent(new FocusEvent('blur'));
  window.dispatchEvent(new FocusEvent('focus'));
  await tick();

  expect(host.getCalls().some((c) => c.command === 'focused')).toBe(true);
});

// Theme (config.theme) and document-driven page visibility.

test('config.theme "dark" gives the snackbar a dark background', async () => {
  host = startPipedriveMockHost({ theme: 'dark' });
  const sdk = await createSdk();

  await sdk.execute(Command.SHOW_SNACKBAR, { message: 'Hi' });

  const bar = (host.shadowRoot as ShadowRoot).querySelector(
    '.pd-mock-snackbar',
  ) as HTMLElement;
  expect(getComputedStyle(bar).backgroundColor).toBe('rgb(43, 47, 54)');
});

test('PAGE_VISIBILITY_STATE delivers the document visibility (SDK-driven)', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();
  const received: Array<{ data?: unknown }> = [];

  sdk.listen(Event.PAGE_VISIBILITY_STATE, (r) => received.push(r));
  // SDK listens to document 'visibilitychange' itself (not via the host).
  document.dispatchEvent(new CustomEvent('visibilitychange'));
  await tick();

  expect(received[0]).toEqual({ data: { state: document.visibilityState } });
});

test('SHOW/HIDE_FLOATING_WINDOW emit a VISIBILITY event', async () => {
  host = startPipedriveMockHost();
  renderSurface('pd-mock-floating-window');
  const sdk = await createSdk();
  const events: Array<unknown> = [];
  sdk.listen(Event.VISIBILITY, (r) => events.push(r.data));
  await tick();

  await sdk.execute(Command.HIDE_FLOATING_WINDOW, {});
  await sdk.execute(Command.SHOW_FLOATING_WINDOW, {});

  await vi.waitFor(() =>
    expect(events).toEqual([
      { is_visible: false, context: { invoker: 'command' } },
      { is_visible: true, context: { invoker: 'command' } },
    ]),
  );
});

test('a disabled host does not listen for or reply to SDK commands', async () => {
  host = startPipedriveMockHost({ enabled: false });

  // Mimic what the real SDK's execute() posts, with a reply port.
  const channel = new MessageChannel();
  let replied = false;
  channel.port1.onmessage = () => {
    replied = true;
  };
  window.postMessage(
    {
      payload: {
        command: 'show_snackbar',
        args: { message: 'x' },
        type: 'command',
      },
      id: 'dev-local',
    },
    '*',
    [channel.port2],
  );
  await tick();
  await tick();

  expect(replied).toBe(false); // no listener registered → no reply
  expect(document.querySelector('pipedrive-mock-host')).toBeNull(); // no UI
});

// Initial size from .initialize({ size }) (see design plan / ADR-0006).

test('initialize({ size }) applies the initial height to the panel surface', async () => {
  host = startPipedriveMockHost();
  const panel = renderSurface('pd-mock-panel');

  await new AppExtensionsSDK({
    identifier: 'dev-local',
    targetWindow: window,
  }).initialize({ size: { height: 500 } });

  expect(panel.offsetHeight).toBe(500);
});

test('initialize({ size }) applies width and height to a floating window', async () => {
  host = startPipedriveMockHost();
  const fw = renderSurface('pd-mock-floating-window');

  await new AppExtensionsSDK({
    identifier: 'dev-local',
    targetWindow: window,
  }).initialize({ size: { width: 500, height: 300 } });

  expect([fw.offsetWidth, fw.offsetHeight]).toEqual([500, 300]);
});

// Theming: every host UI element is overridable via CSS custom properties.

test('host UI colors are overridable via CSS custom properties on the host', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();
  const el = document.querySelector('pipedrive-mock-host') as HTMLElement;
  el.style.setProperty('--pd-mock-negative', 'rgb(1, 2, 3)');

  await sdk.execute(Command.SET_NOTIFICATION, { number: 5 });

  const badge = (host.shadowRoot as ShadowRoot).querySelector(
    '.pd-mock-notification',
  ) as HTMLElement;
  expect(getComputedStyle(badge).backgroundColor).toBe('rgb(1, 2, 3)');
});

test('the confirmation dialog surface is overridable via custom properties', async () => {
  host = startPipedriveMockHost();
  const sdk = await createSdk();
  const el = document.querySelector('pipedrive-mock-host') as HTMLElement;
  el.style.setProperty('--pd-mock-surface-bg', 'rgb(9, 9, 9)');

  void sdk.execute(Command.SHOW_CONFIRMATION, { title: 'Delete?' });

  const dialog = await within(
    host.shadowRoot as unknown as HTMLElement,
  ).findByRole('dialog');
  expect(getComputedStyle(dialog).backgroundColor).toBe('rgb(9, 9, 9)');
});
