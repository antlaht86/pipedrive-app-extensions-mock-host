import { afterEach, expect, test } from 'vitest';
import { startPipedriveMockHost, type MockHost } from './index.js';

// Dev Tool behaviour (ADR-0009, docs/plans/2026-06-16-dev-tool-design.md). These
// are DOM-structure tests, so they run in the jsdom unit project; event delivery
// to a real SDK listener is covered separately in the browser project.

// Tear the host down in afterEach (not per test) so a failed assertion can't
// leave the singleton running and pollute the next test.
let host: MockHost | undefined;

afterEach(() => {
  host?.teardown();
  host = undefined;
  document
    .querySelectorAll(
      'pipedrive-mock-host, .pd-mock-panel, .pd-mock-modal, .pd-mock-floating-window',
    )
    .forEach((el) => el.remove());
});

test('renders the dev tool into the shadow root by default', () => {
  host = startPipedriveMockHost();

  const devTool = host.shadowRoot.querySelector(
    '[aria-label="Mock host dev tool"]',
  );
  expect(devTool).not.toBeNull();
});

test('devTool: false renders no dev tool', () => {
  host = startPipedriveMockHost({ devTool: false });

  expect(
    host.shadowRoot.querySelector('[aria-label="Mock host dev tool"]'),
  ).toBeNull();
});

test('emitting an event adds an Event entry to the Active Log', () => {
  host = startPipedriveMockHost();

  host.emit('user_settings_change', { theme: 'dark' });

  const log = host.shadowRoot.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('user_settings_change');
  expect(log?.textContent).toContain('dark');
});

test('a track the app sends appears in the Active Log', () => {
  host = startPipedriveMockHost();

  window.dispatchEvent(
    new MessageEvent('message', {
      data: { payload: { type: 'track', event: 'focused' } },
    }),
  );

  const log = host.shadowRoot.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('focused');
});

test('a command the app sends appears in the Active Log', () => {
  host = startPipedriveMockHost();

  window.dispatchEvent(
    new MessageEvent('message', {
      data: { payload: { type: 'command', command: 'get_metadata' } },
    }),
  );

  const log = host.shadowRoot.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('get_metadata');
});

test('devTool.position anchors the dev tool to the given corner', () => {
  host = startPipedriveMockHost({
    devTool: { position: 'bottom-right' },
  });

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  expect(tool?.getAttribute('data-position')).toBe('bottom-right');
});

test('host.devTool.setPosition moves the dev tool at runtime', () => {
  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  expect(tool?.getAttribute('data-position')).toBe('bottom-left');

  host.devTool.setPosition('top-right');
  expect(tool?.getAttribute('data-position')).toBe('top-right');
});

test('devTool defaults to the bottom-left corner', () => {
  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  expect(tool?.getAttribute('data-position')).toBe('bottom-left');
});

test('the theme control emits USER_SETTINGS_CHANGE with the chosen theme', () => {
  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const theme = tool?.querySelector<HTMLSelectElement>(
    'select[aria-label="Theme"]',
  );
  const emit = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Emit user settings change"]',
  );

  if (theme) {
    theme.value = 'dark';
  }
  emit?.click();

  const log = tool?.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('user_settings_change');
  expect(log?.textContent).toContain('dark');
});

test('the visibility control emits VISIBILITY with is_visible and invoker', () => {
  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const emit = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Emit visibility"]',
  );
  emit?.click();

  const log = tool?.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('visibility');
  expect(log?.textContent).toContain('is_visible');
  expect(log?.textContent).toContain('invoker');
});

test('the page visibility control emits PAGE_VISIBILITY_STATE with state', () => {
  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const emit = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Emit page visibility state"]',
  );
  emit?.click();

  const log = tool?.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('page_visibility_state');
  expect(log?.textContent).toContain('state');
});

test('the resize control resizes the active surface', () => {
  const panel = document.createElement('div');
  panel.className = 'pd-mock-panel';
  document.body.appendChild(panel);

  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const height = tool?.querySelector<HTMLInputElement>(
    'input[aria-label="Resize height"]',
  );
  const apply = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Apply resize"]',
  );

  if (height) {
    height.value = '300';
  }
  apply?.click();

  expect(panel.style.height).toBe('300px');

  panel.remove();
});

test('the resize control is disabled when there is no active surface', () => {
  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const apply = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Apply resize"]',
  );
  expect(apply?.disabled).toBe(true);
});

test('the resize control is enabled when a surface is present', () => {
  const panel = document.createElement('div');
  panel.className = 'pd-mock-panel';
  document.body.appendChild(panel);

  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const apply = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Apply resize"]',
  );
  expect(apply?.disabled).toBe(false);

  panel.remove();
});

test('a Dev Tool resize is logged as a Dev Tool action', () => {
  const panel = document.createElement('div');
  panel.className = 'pd-mock-panel';
  document.body.appendChild(panel);

  host = startPipedriveMockHost();
  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const height = tool?.querySelector<HTMLInputElement>(
    'input[aria-label="Resize height"]',
  );
  if (height) {
    height.value = '300';
  }
  tool
    ?.querySelector<HTMLButtonElement>('button[aria-label="Apply resize"]')
    ?.click();

  const log = tool?.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('dev tool action');
  expect(log?.textContent).toContain('resize');

  panel.remove();
});

test('a Dev Tool focus toggle is logged as a Dev Tool action', () => {
  const fw = document.createElement('div');
  fw.className = 'pd-mock-floating-window';
  document.body.appendChild(fw);

  host = startPipedriveMockHost();
  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  tool
    ?.querySelector<HTMLButtonElement>('button[aria-label="Toggle focus mode"]')
    ?.click();

  const log = tool?.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('dev tool action');
  expect(log?.textContent).toContain('focus mode');

  fw.remove();
});

test('collapsing the panel emits VISIBILITY to the app', () => {
  const panel = document.createElement('div');
  panel.className = 'pd-mock-panel';
  document.body.appendChild(panel);

  host = startPipedriveMockHost();
  // The host decorates the panel with its header on the initialize handshake.
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { payload: { type: 'command', command: 'initialize' } },
    }),
  );

  const collapse = panel.querySelector<HTMLButtonElement>(
    'button[aria-label="Collapse"]',
  );
  collapse?.click();

  const log = host.shadowRoot.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('visibility');
  expect(log?.textContent).toContain('is_visible');

  panel.remove();
});

test('the floating-window toggle is shown only for a floating window', () => {
  const fw = document.createElement('div');
  fw.className = 'pd-mock-floating-window';
  document.body.appendChild(fw);

  host = startPipedriveMockHost();
  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const toggle = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Toggle floating window visibility"]',
  );

  expect(
    toggle?.closest('.pd-mock-dev-tool-control')?.hasAttribute('hidden'),
  ).toBe(false);
});

test('the floating-window toggle is hidden for a panel', () => {
  const panel = document.createElement('div');
  panel.className = 'pd-mock-panel';
  document.body.appendChild(panel);

  host = startPipedriveMockHost();
  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const toggle = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Toggle floating window visibility"]',
  );

  expect(
    toggle?.closest('.pd-mock-dev-tool-control')?.hasAttribute('hidden'),
  ).toBe(true);
});

test('the floating-window toggle hides and re-shows the window', () => {
  const fw = document.createElement('div');
  fw.className = 'pd-mock-floating-window';
  document.body.appendChild(fw);

  host = startPipedriveMockHost();
  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const toggle = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Toggle floating window visibility"]',
  );

  toggle?.click();
  expect(fw.style.display).toBe('none');
  const log = tool?.querySelector('[aria-label="Active log"]');
  expect(log?.textContent).toContain('visibility');
  expect(log?.textContent).toContain('"is_visible":false');

  toggle?.click();
  expect(fw.style.display).not.toBe('none');
});

test('the focus-mode control is shown when a floating window is active', () => {
  const fw = document.createElement('div');
  fw.className = 'pd-mock-floating-window';
  document.body.appendChild(fw);

  host = startPipedriveMockHost();
  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const focus = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Toggle focus mode"]',
  );

  expect(
    focus?.closest('.pd-mock-dev-tool-control')?.hasAttribute('hidden'),
  ).toBe(false);

  fw.remove();
});

test('the focus-mode control is hidden when the surface is a panel', () => {
  const panel = document.createElement('div');
  panel.className = 'pd-mock-panel';
  document.body.appendChild(panel);

  host = startPipedriveMockHost();
  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const focus = tool?.querySelector<HTMLButtonElement>(
    'button[aria-label="Toggle focus mode"]',
  );

  expect(
    focus?.closest('.pd-mock-dev-tool-control')?.hasAttribute('hidden'),
  ).toBe(true);

  panel.remove();
});

test('the focus toggle disables the floating window close button', () => {
  const fw = document.createElement('div');
  fw.className = 'pd-mock-floating-window';
  document.body.appendChild(fw);

  host = startPipedriveMockHost();
  // Decorate the floating window so it carries a header close button.
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { payload: { type: 'command', command: 'initialize' } },
    }),
  );

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  tool
    ?.querySelector<HTMLButtonElement>('button[aria-label="Toggle focus mode"]')
    ?.click();

  const close = fw.querySelector<HTMLButtonElement>('.pd-mock-surface-close');
  expect(close?.disabled).toBe(true);

  fw.remove();
});

test('adding a floating window reveals the focus control reactively', async () => {
  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const focusRow = tool
    ?.querySelector<HTMLButtonElement>('button[aria-label="Toggle focus mode"]')
    ?.closest('.pd-mock-dev-tool-control');

  expect(focusRow?.hasAttribute('hidden')).toBe(true);

  const fw = document.createElement('div');
  fw.className = 'pd-mock-floating-window';
  document.body.appendChild(fw);
  await new Promise((resolve) => setTimeout(resolve, 0)); // let the observer fire

  expect(focusRow?.hasAttribute('hidden')).toBe(false);

  fw.remove();
});

test('devTool startCollapsed starts the dev tool collapsed', () => {
  host = startPipedriveMockHost({ devTool: { startCollapsed: true } });

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  expect(tool?.getAttribute('data-collapsed')).toBe('true');

  const toggle = tool?.querySelector<HTMLButtonElement>(
    'button[aria-expanded]',
  );
  expect(toggle?.getAttribute('aria-expanded')).toBe('false');
});

test('the dev tool starts open by default', () => {
  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  expect(tool?.getAttribute('data-collapsed')).not.toBe('true');
});

test('the dev tool can be collapsed and expanded via its toggle', () => {
  host = startPipedriveMockHost();

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
});

test('clicking the header row (not just the toggle) collapses and expands the dev tool', () => {
  host = startPipedriveMockHost();

  const tool = host.shadowRoot.querySelector<HTMLElement>(
    '[aria-label="Mock host dev tool"]',
  );
  const header = tool?.querySelector<HTMLElement>('.pd-mock-dev-tool-header');
  const title = tool?.querySelector<HTMLElement>('.pd-mock-dev-tool-title');
  const toggle = tool?.querySelector<HTMLButtonElement>(
    'button[aria-expanded]',
  );

  expect(tool?.getAttribute('data-collapsed')).not.toBe('true');

  // Click the title — anywhere on the header row should toggle (it bubbles).
  title?.click();
  expect(tool?.getAttribute('data-collapsed')).toBe('true');
  expect(toggle?.getAttribute('aria-expanded')).toBe('false');

  // Click the header again to expand.
  header?.click();
  expect(tool?.getAttribute('data-collapsed')).not.toBe('true');
  expect(toggle?.getAttribute('aria-expanded')).toBe('true');
});
