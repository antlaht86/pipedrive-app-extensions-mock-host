/**
 * pipedrive-app-extensions-mock-host
 *
 * Framework-agnostic development-only mock host for the Pipedrive App
 * Extensions SDK (`@pipedrive/app-extensions-sdk`). Instead of letting the SDK
 * post messages to a missing Pipedrive parent window, this package plays that
 * window itself and renders real UI elements into the page, so you can develop
 * and test an app extension locally — in any framework or in plain vanilla JS.
 *
 * See `docs/plans/2026-06-15-mock-host-design.md` for the full design. The
 * implementation is built up incrementally, one vertical slice at a time.
 */

/**
 * Placeholder export so this remains a module until the public API lands.
 * Bumped manually for now; it is not auto-synced with package.json.
 */
export const VERSION = '0.0.0';

/** Arguments the App Extension passes to `SHOW_CONFIRMATION`. */
export interface ConfirmationArgs {
  title: string;
  description?: string;
  okText?: string;
  cancelText?: string;
  okColor?: string;
}

/** Attributes the App Extension passes to `OPEN_MODAL`. */
export interface ModalArgs {
  type?: string;
  action_id?: string;
  data?: Record<string, string>;
  prefill?: Record<string, unknown>;
}

/** The `{ status, id? }` an opened modal resolves to. */
export interface ModalResult {
  status: string;
  id?: number;
}

/** Corner the Dev Tool overlay anchors to. */
export type DevToolPosition =
  | 'bottom-left'
  | 'bottom-right'
  | 'top-left'
  | 'top-right';

/** Configuration for the Mock Host. Fields land incrementally; see the design. */
export interface MockHostConfig {
  /**
   * Turn the host off without removing the call (e.g. pass a dev flag:
   * `{ enabled: import.meta.env.DEV }`). When `false`, returns an inert handle.
   * Defaults to `true`.
   */
  enabled?: boolean;
  /** Visual theme for the host's own mock UI. Defaults to `'light'`. */
  theme?: 'light' | 'dark';
  /**
   * Headless override for `SHOW_CONFIRMATION`: return whether the user
   * confirmed. When omitted, an interactive dialog is rendered instead.
   */
  onConfirmation?: (args: ConfirmationArgs) => boolean | Promise<boolean>;
  /**
   * Provides the token returned by `GET_SIGNED_TOKEN`. Return a real (dev) JWT
   * to exercise your backend's verify path. Defaults to `'dev-signed-token'`.
   */
  getSignedToken?: () => string | Promise<string>;
  /** Headless override for `OPEN_MODAL`; return the modal result. */
  onModal?: (attrs: ModalArgs) => ModalResult | Promise<ModalResult>;
  /** Maps a CUSTOM_MODAL `action_id` to the URL the modal iframe should load. */
  customModals?:
    | Record<string, string>
    | ((attrs: ModalArgs) => string | undefined);
  /**
   * Name shown in the surface header bar the host injects onto each surface
   * (panel/modal/floating window). Defaults to `'App Extension'`.
   */
  appName?: string;
  /**
   * Icon shown in the surface header bar — a URL (rendered as an `<img>`) or a
   * short glyph/emoji (rendered as text). Defaults to a generic mock glyph.
   */
  appIcon?: string;
  /**
   * The host's own interactive Dev Tool overlay (ADR-0009). On by default; pass
   * `false` to omit it entirely, or an object to configure it.
   */
  devTool?:
    | boolean
    | {
        /** Corner the Dev Tool anchors to. Defaults to `'bottom-left'`. */
        position?: DevToolPosition;
        /** Start the Dev Tool collapsed to its launcher. Defaults to `false`. */
        startCollapsed?: boolean;
      };
}

/** A single command the App Extension sent, captured for inspection in tests. */
export interface MockHostCall {
  readonly command: string;
  readonly args: unknown;
}

/** Handle returned by {@link startPipedriveMockHost}. */
export interface MockHost {
  /** Open shadow root the host renders its UI into. Query it in tests. */
  readonly shadowRoot: ShadowRoot;
  /** Push a host-driven event to the App Extension. (Lands in a later slice.) */
  emit(event: string, data: unknown): void;
  /** The commands the App Extension has sent so far. */
  getCalls(): MockHostCall[];
  /** Runtime controls for the Dev Tool overlay (no-ops when it is disabled). */
  readonly devTool: {
    /** Move the Dev Tool to a corner at runtime (e.g. per view). */
    setPosition(position: DevToolPosition): void;
  };
  /** Stop listening and remove all rendered UI. */
  teardown(): void;
}

// The host's runtime is split into deep internal modules: the Message router and
// Command intake (the seam below `window`), host-effects (the effects only the
// host can produce, also driven by the Dev Tool), Event push, and the Surface
// helpers. See CONTEXT.md and docs/plans/2026-06-18-command-intake-seam.md.
import { createHostEffects } from './host-effects.js';
import { createRouter, type ParsedMessage } from './router.js';
import { resolveSurface, surfaceTypeOf } from './surface.js';
// Wire-protocol event names the Dev Tool emits (internal copies of the SDK enum
// values; ADR-0003). The router/intake own the rest; these are all index needs.
import {
  EVENT_VISIBILITY,
  EVENT_USER_SETTINGS_CHANGE,
  EVENT_PAGE_VISIBILITY_STATE,
} from './wire.js';

// Scoped to the shadow root — a calm, grey, clearly-a-mock surface. The palette
// lives in CSS custom properties on :host so themes can override it later.
// The full palette for every host UI element, as CSS custom properties on the
// shadow host. Injected eagerly so all components (snackbar, confirmation,
// modal, chrome) resolve them regardless of render order. Consumers override any
// of these on the <pipedrive-mock-host> element (custom properties pierce the
// shadow boundary) — e.g. `pipedrive-mock-host { --pd-mock-accent: #f06; }`.
const HOST_VARS_STYLES = `
  :host {
    --pd-mock-surface-bg: #ffffff;
    --pd-mock-bg: #e9ebee;
    --pd-mock-fg: #20242b;
    --pd-mock-muted: #5b626b;
    --pd-mock-border: #d2d6dc;
    --pd-mock-badge-bg: #4a5159;
    --pd-mock-badge-fg: #f4f5f6;
    --pd-mock-link: #2563eb;
    --pd-mock-accent: #2563eb;
    --pd-mock-accent-fg: #ffffff;
    --pd-mock-negative: #d6453d;
    --pd-mock-indicator-bg: #23272e;
    --pd-mock-indicator-fg: #ffffff;
    --pd-mock-backdrop: rgba(20, 24, 31, 0.35);
    --pd-mock-shadow: 0 6px 20px rgba(20, 24, 31, 0.18);
  }
  :host([data-theme='dark']) {
    --pd-mock-surface-bg: #2b2f36;
    --pd-mock-bg: #2b2f36;
    --pd-mock-fg: #eef1f4;
    --pd-mock-muted: #aab2bd;
    --pd-mock-border: #3a4047;
    --pd-mock-link: #8ab4ff;
  }
`;

// Injected into document.head (light DOM) — styles the consumer's wrapper div as
// a Custom Panel surface. Fixed width and the panel's height bounds (ADR-0005).
const SURFACE_STYLES = `
  .pd-mock-panel {
    box-sizing: border-box;
    width: 385px;
    height: 100px;
    overflow: auto;
    background: #fff;
    border: 1px solid #e3e6ea;
    border-radius: 3px;
    box-shadow: 0 1px 3px rgba(20, 24, 31, 0.08);
  }
  .pd-mock-modal {
    box-sizing: border-box;
    position: fixed;
    /* Docked to the top-centre like Pipedrive (the modal meets the viewport's
       top edge), not vertically centred. translateX still establishes the
       containing block the scroll layer's fixed footer pins to (ADR-0010). */
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 520px;
    height: 400px;
    overflow: auto;
    background: #fff;
    /* Square top corners since the dialog meets the viewport's top edge. */
    border-radius: 0 0 4px 4px;
    box-shadow:
      0 0 0 100vmax rgba(20, 24, 31, 0.35),
      0 16px 48px rgba(20, 24, 31, 0.3);
    z-index: 2147483641;
  }
  .pd-mock-floating-window {
    box-sizing: border-box;
    position: fixed;
    top: 2rem;
    right: 2rem;
    width: 320px;
    height: 240px;
    overflow: auto;
    background: #fff;
    border: 1px solid #e3e6ea;
    border-radius: 4px;
    box-shadow: 0 8px 28px rgba(20, 24, 31, 0.22);
    z-index: 2147483640;
  }
  /* Scroll layer (opt-in). A consumer wraps its content in
     <div class="pd-mock-scroll-layer"> to emulate Pipedrive's production
     surface, which renders the app in an overflow:hidden wrapper around a
     scrolling <iframe> (see ADR-0010). When the layer is present, the surface
     becomes a non-scrolling flex-column "frame" that establishes the containing
     block for position:fixed descendants — so a bottom-pinned footer pins to the
     surface, not the browser window — and the scroll layer is the single scroll
     container. Without the layer, the surface scrolls itself as before. */
  .pd-mock-panel:has(> .pd-mock-scroll-layer),
  .pd-mock-modal:has(> .pd-mock-scroll-layer),
  .pd-mock-floating-window:has(> .pd-mock-scroll-layer) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* Panel and floating window have no transform of their own, so give them one
     to become the fixed-positioning containing block. The modal already has a
     transform: translateX(-50%) (it docks to the top-centre) — that transform is
     its containing block, so it must NOT be overridden here. */
  .pd-mock-panel:has(> .pd-mock-scroll-layer),
  .pd-mock-floating-window:has(> .pd-mock-scroll-layer) {
    transform: translateZ(0);
  }
  .pd-mock-panel:has(> .pd-mock-scroll-layer) > .pd-mock-surface-header,
  .pd-mock-modal:has(> .pd-mock-scroll-layer) > .pd-mock-surface-header,
  .pd-mock-floating-window:has(> .pd-mock-scroll-layer) > .pd-mock-surface-header {
    flex: none;
  }
  .pd-mock-scroll-layer {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
  .pd-mock-collapsed > :not(.pd-mock-surface-header) {
    display: none !important;
  }
  .pd-mock-collapsed {
    height: auto !important;
    min-height: 0 !important;
  }
  /* Host-injected surface chrome — a title bar pinned to the top of the surface,
     mirroring the frame Pipedrive renders around the app's iframe. */
  .pd-mock-surface-header {
    position: sticky;
    top: 0;
    z-index: 2;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 6px 0 12px;
    background: #fbfcfd;
    border-bottom: 1px solid #e8ebef;
    border-radius: inherit;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    font: 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #20242b;
    user-select: none;
  }
  .pd-mock-surface-icon {
    flex: none;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    font-size: 14px;
    line-height: 1;
    border-radius: 5px;
    overflow: hidden;
    object-fit: cover;
  }
  .pd-mock-surface-title {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pd-mock-surface-btn {
    flex: none;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #6b7280;
    cursor: pointer;
    font: inherit;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .pd-mock-surface-btn::before {
    font-size: 15px;
    line-height: 1;
  }
  .pd-mock-surface-btn:hover {
    background: #eef0f3;
    color: #20242b;
  }
  .pd-mock-surface-btn:disabled {
    color: #c4cad2;
    background: transparent;
    cursor: not-allowed;
  }
  /* A single CSS-drawn chevron so the open/closed states are the SAME shape,
     just rotated 180° (a thin caret glyph differs subtly between ⌃ and ⌄). */
  .pd-mock-surface-collapse::before {
    content: '';
    width: 7px;
    height: 7px;
    border-top: 1.75px solid currentColor;
    border-left: 1.75px solid currentColor;
    transform: translateY(1.5px) rotate(45deg);
    transition: transform 0.18s ease;
  }
  .pd-mock-collapsed > .pd-mock-surface-header .pd-mock-surface-collapse::before {
    transform: translateY(-1.5px) rotate(225deg);
  }
  .pd-mock-surface-refresh::before {
    content: '\\27F3';
    font-size: 20px;
  }
  .pd-mock-surface-more::before {
    content: '\\22EF';
    font-size: 18px;
  }
  .pd-mock-surface-close::before {
    content: '\\2715';
  }
`;

// Dev Tool overlay (ADR-0009). Pipedrive-like: clean light panel, green header
// accent, system type; docked to a corner. Positioned bottom-left by default;
// the data-position attribute moves it to any corner.
const DEV_TOOL_STYLES = `
  .pd-mock-dev-tool {
    position: fixed;
    z-index: 2147483647;
    width: 580px;
    max-width: calc(100vw - 24px);
    max-height: 300px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--pd-mock-surface-bg);
    color: var(--pd-mock-fg);
    border: 1px solid var(--pd-mock-border);
    border-radius: 10px;
    box-shadow: var(--pd-mock-shadow);
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .pd-mock-dev-tool[data-collapsed="true"] {
    max-height: none;
  }
  .pd-mock-dev-tool[data-collapsed="true"] .pd-mock-dev-tool-body {
    display: none;
  }
  .pd-mock-dev-tool-body {
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
  }
  .pd-mock-dev-tool-controls {
    flex: 0 0 240px;
    overflow-y: auto;
    padding: 10px 12px;
    border-right: 1px solid var(--pd-mock-border);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pd-mock-dev-tool-control {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  /* Must beat the .pd-mock-dev-tool-control { display: flex } above — that class
     rule otherwise overrides the UA [hidden] { display: none }, leaving gated
     controls (focus mode, floating window) visible on non-floating surfaces. */
  .pd-mock-dev-tool-control[hidden] {
    display: none;
  }
  .pd-mock-dev-tool-control-label {
    flex: 0 0 4.5rem;
    color: var(--pd-mock-muted);
  }
  .pd-mock-dev-tool-control select,
  .pd-mock-dev-tool-control input {
    flex: 1 1 auto;
    min-width: 0;
    font: inherit;
    padding: 3px 5px;
    border: 1px solid var(--pd-mock-border);
    border-radius: 5px;
    background: var(--pd-mock-surface-bg);
    color: var(--pd-mock-fg);
  }
  .pd-mock-dev-tool-control button {
    flex: 0 0 auto;
    padding: 4px 10px;
    border: none;
    border-radius: 5px;
    background: #017737;
    color: #ffffff;
    font: 600 12px/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .pd-mock-dev-tool-control button:hover {
    background: #015e2c;
  }
  .pd-mock-dev-tool[data-position="bottom-left"] { bottom: 12px; left: 12px; }
  .pd-mock-dev-tool[data-position="bottom-right"] { bottom: 12px; right: 12px; }
  .pd-mock-dev-tool[data-position="top-left"] { top: 12px; left: 12px; }
  .pd-mock-dev-tool[data-position="top-right"] { top: 12px; right: 12px; }
  .pd-mock-dev-tool-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    background: #017737;
    color: #ffffff;
    font-weight: 600;
    letter-spacing: 0.01em;
    flex: 0 0 auto;
    /* The whole header row toggles collapse, so it reads as clickable. */
    cursor: pointer;
    user-select: none;
  }
  .pd-mock-dev-tool-header::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #7be3a6;
    box-shadow: 0 0 0 3px rgba(123, 227, 166, 0.3);
    flex: 0 0 auto;
  }
  .pd-mock-dev-tool-title {
    flex: 1 1 auto;
  }
  .pd-mock-dev-tool-toggle {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
    font: 600 16px/1 system-ui, sans-serif;
    cursor: pointer;
  }
  .pd-mock-dev-tool-toggle:hover {
    background: rgba(255, 255, 255, 0.3);
  }
  .pd-mock-dev-tool-log {
    margin: 0;
    padding: 0;
    list-style: none;
    /* fills the rest of the body row and scrolls vertically; min-width: 0 lets
       it shrink instead of forcing the panel wider. */
    flex: 1 1 auto;
    min-width: 0;
    overflow-y: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
  }
  .pd-mock-dev-tool-log:empty::after {
    content: "No activity yet";
    display: block;
    padding: 12px;
    color: var(--pd-mock-muted);
    font-family: system-ui, sans-serif;
    font-style: italic;
  }
  .pd-mock-dev-tool-log > li {
    padding: 6px 12px;
    border-top: 1px solid var(--pd-mock-border);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .pd-mock-dev-tool-log > li:first-child {
    border-top: none;
  }
`;

/** Inert handle returned when there is no DOM (e.g. SSR). */
const NOOP_HOST: MockHost = {
  get shadowRoot(): ShadowRoot {
    throw new Error('Mock host is inactive: no DOM available (SSR).');
  },
  emit() {},
  getCalls() {
    return [];
  },
  devTool: { setPosition() {} },
  teardown() {},
};

/** The currently running host, if any — used to prevent duplicate instances. */
let activeHost: MockHost | null = null;

// Read NODE_ENV off globalThis (no Node types needed) via bracket access, which
// avoids static `process.env.NODE_ENV` inlining and stays stubbable in tests.
// Absent `process` (pure browser / IIFE) → not production.
const isProductionEnv = (): boolean => {
  const proc = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process;
  return proc?.env?.['NODE_ENV'] === 'production';
};

/**
 * Start the Mock Host: listen for the SDK's messages on `window` and answer
 * them. Returns a handle to inspect, drive and tear down the host.
 */
export function startPipedriveMockHost(config: MockHostConfig = {}): MockHost {
  // SSR-safe: with no window (e.g. Next.js server render) return an inert handle.
  if (typeof window === 'undefined') {
    return NOOP_HOST;
  }

  // Explicit off-switch (e.g. { enabled: import.meta.env.DEV }).
  if (config.enabled === false) {
    return NOOP_HOST;
  }

  // Production tripwire: this is a dev-only tool. Stay inert and warn loudly so
  // an accidentally-shipped call is caught. Gate the call behind a build-time
  // dev flag to drop it from the bundle entirely (see ADR-0007).
  if (isProductionEnv()) {
    console.warn(
      '[pipedrive-mock-host] startPipedriveMockHost() was called with ' +
        'NODE_ENV=production. The mock host is development-only; it will not ' +
        'start. Gate the call behind a dev flag (e.g. { enabled: isDev }).',
    );
    return NOOP_HOST;
  }

  // One host at a time: a second listener would double-process every command.
  if (activeHost) {
    console.warn(
      '[pipedrive-mock-host] A host is already running; returning the existing instance. Call teardown() before starting again.',
    );
    return activeHost;
  }

  // The Dev Tool's root and Active-Log elements; assigned when the Dev Tool is
  // built, null when it is off. `logToDevTool` prepends entries newest-first and
  // no-ops when there is no log to write to.
  let devToolElement: HTMLElement | null = null;
  let devToolLog: HTMLElement | null = null;
  // Surface-dependent Dev Tool controls (kept in sync by the observer below):
  // the focus-mode row (floating-window only) and the resize row (disabled with
  // no active surface). Plus the observer itself.
  let devToolFocusRow: HTMLElement | null = null;
  let devToolWindowRow: HTMLElement | null = null;
  let devToolResizeRow: HTMLElement | null = null;
  let devToolResizeLabel: HTMLElement | null = null;
  let devToolObserver: MutationObserver | null = null;
  const logToDevTool = (
    direction: string,
    kind: string,
    name: string,
    payload?: unknown,
  ): void => {
    if (!devToolLog) {
      return;
    }
    const entry = document.createElement('li');
    const detail = payload === undefined ? '' : ` ${JSON.stringify(payload)}`;
    entry.textContent = `${direction} ${kind}: ${name}${detail}`;
    devToolLog.prepend(entry);
  };

  const hostEl = document.createElement('pipedrive-mock-host');
  // Theme drives the shadow-root CSS custom properties (default light).
  hostEl.setAttribute('data-theme', config.theme === 'dark' ? 'dark' : 'light');
  const shadowRoot = hostEl.attachShadow({ mode: 'open' });
  // Inject the variable palette eagerly so every component can reference it.
  const varsStyle = document.createElement('style');
  varsStyle.textContent = HOST_VARS_STYLES;
  shadowRoot.appendChild(varsStyle);
  document.body.appendChild(hostEl);

  // Surface-wrapper styles live in the light DOM, since they target the
  // consumer's own element (e.g. <div class="pd-mock-panel">).
  const surfaceStyleEl = document.createElement('style');
  surfaceStyleEl.setAttribute('data-pd-mock', 'surface-styles');
  surfaceStyleEl.textContent = SURFACE_STYLES;
  document.head.appendChild(surfaceStyleEl);

  // The host-effects (Surface, Event push, overlays, config) and the Message
  // router that drives them. The window transport (below) and the Dev Tool both
  // feed this same seam — the Dev Tool drives only host-producible effects, never
  // a faked Command (ADR-0009).
  const host = createHostEffects({ shadowRoot, config, log: logToDevTool });
  const router = createRouter({ host, log: logToDevTool });

  // Aliases so the Dev Tool's controls read naturally; each is a host-producible
  // effect on the host-effects seam.
  const emitEvent = (name: string, data: unknown): void =>
    host.events.emit(name, data);
  const applySize = host.surface.resize;
  const applyFocusMode = host.surface.setFocusMode;
  const setFloatingWindowVisible = host.surface.setFloatingWindowVisible;

  // Dev Tool: the host's own control overlay, rendered into the shadow root so
  // it needs no consumer markup (ADR-0009). On by default.
  if (config.devTool !== false) {
    const devToolConfig =
      typeof config.devTool === 'object' ? config.devTool : {};
    const position = devToolConfig.position ?? 'bottom-left';

    const devToolStyle = document.createElement('style');
    devToolStyle.textContent = DEV_TOOL_STYLES;
    shadowRoot.appendChild(devToolStyle);

    const devToolEl = document.createElement('section');
    devToolEl.className = 'pd-mock-dev-tool';
    devToolEl.setAttribute('aria-label', 'Mock host dev tool');
    devToolEl.setAttribute('data-position', position);
    devToolElement = devToolEl;

    const header = document.createElement('header');
    header.className = 'pd-mock-dev-tool-header';

    const title = document.createElement('span');
    title.className = 'pd-mock-dev-tool-title';
    title.textContent = 'Mock host';
    header.appendChild(title);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pd-mock-dev-tool-toggle';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Collapse dev tool');
    toggle.textContent = '–';
    header.appendChild(toggle);
    devToolEl.appendChild(header);

    const setCollapsed = (next: boolean): void => {
      devToolEl.setAttribute('data-collapsed', String(next));
      toggle.setAttribute('aria-expanded', String(!next));
      toggle.setAttribute(
        'aria-label',
        next ? 'Expand dev tool' : 'Collapse dev tool',
      );
      toggle.textContent = next ? '+' : '–';
    };

    // The whole header row toggles collapse — not just the +/- button — so the
    // user need not aim at the small button. The button lives inside the header,
    // so its click (incl. keyboard activation) bubbles here and is handled once;
    // it keeps its own aria-expanded for assistive tech.
    header.addEventListener('click', () => {
      setCollapsed(devToolEl.getAttribute('data-collapsed') !== 'true');
    });

    // Start collapsed if requested (the toggle's click logic reads this attr).
    if (devToolConfig.startCollapsed) {
      setCollapsed(true);
    }

    // Two columns: Controls on the left, the Active Log on the right.
    const body = document.createElement('div');
    body.className = 'pd-mock-dev-tool-body';

    const controls = document.createElement('div');
    controls.className = 'pd-mock-dev-tool-controls';
    controls.setAttribute('aria-label', 'Controls');

    // An event-emitter row: a label, one select per payload field, and an Emit
    // button that builds the SDK-shaped payload from the selected values.
    const addEmitControl = (
      label: string,
      emitAriaLabel: string,
      eventName: string,
      fields: { ariaLabel: string; options: string[] }[],
      buildPayload: (values: string[]) => unknown,
    ): void => {
      const row = document.createElement('div');
      row.className = 'pd-mock-dev-tool-control';
      const labelEl = document.createElement('span');
      labelEl.className = 'pd-mock-dev-tool-control-label';
      labelEl.textContent = label;
      row.appendChild(labelEl);
      const selects: HTMLSelectElement[] = [];
      for (const field of fields) {
        const select = document.createElement('select');
        select.setAttribute('aria-label', field.ariaLabel);
        for (const value of field.options) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          select.appendChild(option);
        }
        selects.push(select);
        row.appendChild(select);
      }
      const emit = document.createElement('button');
      emit.type = 'button';
      emit.setAttribute('aria-label', emitAriaLabel);
      emit.textContent = 'Emit';
      emit.addEventListener('click', () => {
        emitEvent(
          eventName,
          buildPayload(selects.map((select) => select.value)),
        );
      });
      row.appendChild(emit);
      controls.appendChild(row);
    };

    addEmitControl(
      'Theme',
      'Emit user settings change',
      EVENT_USER_SETTINGS_CHANGE,
      [{ ariaLabel: 'Theme', options: ['light', 'dark'] }],
      ([theme]) => ({ theme }),
    );
    addEmitControl(
      'Visibility',
      'Emit visibility',
      EVENT_VISIBILITY,
      [
        { ariaLabel: 'Is visible', options: ['true', 'false'] },
        { ariaLabel: 'Invoker', options: ['user', 'command'] },
      ],
      ([isVisible, invoker]) => ({
        is_visible: isVisible === 'true',
        context: { invoker },
      }),
    );
    addEmitControl(
      'Page',
      'Emit page visibility state',
      EVENT_PAGE_VISIBILITY_STATE,
      [{ ariaLabel: 'State', options: ['visible', 'hidden'] }],
      ([state]) => ({ state }),
    );

    // Resize — width/height inputs that resize the active surface. `applySize`
    // enforces the per-surface bounds, exactly like the real RESIZE command.
    const resizeRow = document.createElement('div');
    resizeRow.className = 'pd-mock-dev-tool-control';
    const resizeLabel = document.createElement('span');
    resizeLabel.className = 'pd-mock-dev-tool-control-label';
    resizeLabel.textContent = 'Resize';
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.setAttribute('aria-label', 'Resize width');
    widthInput.placeholder = 'w';
    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.setAttribute('aria-label', 'Resize height');
    heightInput.placeholder = 'h';
    const resizeApply = document.createElement('button');
    resizeApply.type = 'button';
    resizeApply.setAttribute('aria-label', 'Apply resize');
    resizeApply.textContent = 'Apply';
    resizeApply.addEventListener('click', () => {
      const size = {
        width: widthInput.value !== '' ? Number(widthInput.value) : undefined,
        height:
          heightInput.value !== '' ? Number(heightInput.value) : undefined,
      };
      if (applySize(size, 'dev tool resize')) {
        logToDevTool('dev tool', 'action', 'resize', size);
      }
    });
    resizeRow.append(resizeLabel, widthInput, heightInput, resizeApply);
    controls.appendChild(resizeRow);
    devToolResizeRow = resizeRow;
    devToolResizeLabel = resizeLabel;

    // Focus mode — floating-window only, so this row is hidden for other
    // surfaces (toggled by refreshDevToolSurface below).
    const focusRow = document.createElement('div');
    focusRow.className = 'pd-mock-dev-tool-control';
    focusRow.hidden = true;
    const focusLabel = document.createElement('span');
    focusLabel.className = 'pd-mock-dev-tool-control-label';
    focusLabel.textContent = 'Focus mode';
    const focusToggle = document.createElement('button');
    focusToggle.type = 'button';
    focusToggle.setAttribute('aria-label', 'Toggle focus mode');
    focusToggle.setAttribute('aria-pressed', 'false');
    focusToggle.textContent = 'Off';
    focusToggle.addEventListener('click', () => {
      const on = focusToggle.getAttribute('aria-pressed') !== 'true';
      focusToggle.setAttribute('aria-pressed', String(on));
      focusToggle.textContent = on ? 'On' : 'Off';
      applyFocusMode(on);
      logToDevTool('dev tool', 'action', 'focus mode', { enabled: on });
    });
    focusRow.append(focusLabel, focusToggle);
    controls.appendChild(focusRow);
    devToolFocusRow = focusRow;

    // Floating window visibility — floating-window only. Reads the surface's
    // current display so it stays correct even if hidden via the header X.
    const windowRow = document.createElement('div');
    windowRow.className = 'pd-mock-dev-tool-control';
    windowRow.hidden = true;
    const windowLabel = document.createElement('span');
    windowLabel.className = 'pd-mock-dev-tool-control-label';
    windowLabel.textContent = 'Floating window';
    const windowToggle = document.createElement('button');
    windowToggle.type = 'button';
    windowToggle.setAttribute(
      'aria-label',
      'Toggle floating window visibility',
    );
    windowToggle.textContent = 'Visible';
    windowToggle.addEventListener('click', () => {
      const hidden = resolveSurface().style.display === 'none';
      setFloatingWindowVisible(hidden);
      windowToggle.textContent = hidden ? 'Visible' : 'Hidden';
    });
    windowRow.append(windowLabel, windowToggle);
    controls.appendChild(windowRow);
    devToolWindowRow = windowRow;

    const log = document.createElement('ul');
    log.className = 'pd-mock-dev-tool-log';
    log.setAttribute('aria-label', 'Active log');
    devToolLog = log;

    body.append(controls, log);
    devToolEl.appendChild(body);
    shadowRoot.appendChild(devToolEl);
  }

  // Transport adapter: the SDK posts the App Extension's messages to this window
  // over a MessageChannel. Parse the envelope and take the reply port, then hand
  // the parsed message to the Message router — the host's seam below `window`.
  // For a Command the router answers via `reply`; for a listener registration it
  // keeps the `port`.
  const onMessage = (event: MessageEvent): void => {
    const payload = (event.data as { payload?: ParsedMessage } | undefined)
      ?.payload;
    if (!payload) {
      return;
    }
    const port = event.ports[0] as MessagePort | undefined;
    router.dispatch(
      payload,
      (response) => port?.postMessage({ data: response }),
      port,
    );
  };

  // Keep surface-dependent Dev Tool controls in sync with the active surface:
  // the focus-mode row shows only for a floating window. resolveSurface() is not
  // reactive and frameworks mount/unmount the wrapper, so watch the DOM (class/id
  // toggles included) and recompute. Cheap: one querySelector per mutation.
  if (devToolElement) {
    const refreshDevToolSurface = (): void => {
      const type = surfaceTypeOf(resolveSurface());
      const isFloatingWindow = type === 'pd-mock-floating-window';
      if (devToolFocusRow) {
        devToolFocusRow.hidden = !isFloatingWindow;
      }
      if (devToolWindowRow) {
        devToolWindowRow.hidden = !isFloatingWindow;
        const button =
          devToolWindowRow.querySelector<HTMLButtonElement>('button');
        if (button) {
          button.textContent =
            resolveSurface().style.display === 'none' ? 'Hidden' : 'Visible';
        }
      }
      if (devToolResizeRow) {
        // No surface (body fallback) → nothing to size, so disable the control.
        const hasSurface = type !== undefined;
        devToolResizeRow
          .querySelectorAll<HTMLInputElement>('input')
          .forEach((input) => {
            input.disabled = !hasSurface;
          });
        devToolResizeRow
          .querySelectorAll<HTMLButtonElement>('button')
          .forEach((button) => {
            button.disabled = !hasSurface;
          });
        if (devToolResizeLabel) {
          devToolResizeLabel.textContent = hasSurface ? 'Resize' : 'No surface';
        }
      }
    };
    refreshDevToolSurface();
    devToolObserver = new MutationObserver(refreshDevToolSurface);
    devToolObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      // 'style' so the window toggle's label re-syncs when the surface is hidden
      // via its header X (a display change, not a class/id change).
      attributeFilter: ['class', 'id', 'style'],
    });
  }

  window.addEventListener('message', onMessage);

  const handle: MockHost = {
    shadowRoot,
    emit(eventName, eventData) {
      host.events.emit(eventName, eventData);
    },
    getCalls() {
      return router.getCalls();
    },
    devTool: {
      setPosition(position) {
        devToolElement?.setAttribute('data-position', position);
      },
    },
    teardown() {
      window.removeEventListener('message', onMessage);
      devToolObserver?.disconnect();
      hostEl.remove();
      surfaceStyleEl.remove();
      host.events.clear();
      activeHost = null;
    },
  };

  activeHost = handle;
  return handle;
}
