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

// Wire-protocol constants — internal copies of the Real SDK's enum values, so the
// host has no runtime dependency on @pipedrive/app-extensions-sdk (see ADR-0003).
const MESSAGE_TYPE_COMMAND = 'command';
const MESSAGE_TYPE_LISTENER = 'listener';
const MESSAGE_TYPE_TRACK = 'track';
const COMMAND_INITIALIZE = 'initialize';
const COMMAND_SHOW_SNACKBAR = 'show_snackbar';
const COMMAND_SHOW_CONFIRMATION = 'show_confirmation';
const COMMAND_RESIZE = 'resize';
const COMMAND_GET_METADATA = 'get_metadata';
const COMMAND_GET_SIGNED_TOKEN = 'get_signed_token';
const COMMAND_SET_NOTIFICATION = 'set_notification';
const COMMAND_SET_FOCUS_MODE = 'set_focus_mode';
const COMMAND_REDIRECT_TO = 'redirect_to';
const COMMAND_SHOW_FLOATING_WINDOW = 'show_floating_window';
const COMMAND_HIDE_FLOATING_WINDOW = 'hide_floating_window';
const COMMAND_OPEN_MODAL = 'open_modal';
const COMMAND_CLOSE_MODAL = 'close_modal';
const EVENT_CLOSE_CUSTOM_MODAL = 'close_custom_modal';
const EVENT_VISIBILITY = 'visibility';
const EVENT_USER_SETTINGS_CHANGE = 'user_settings_change';
const EVENT_PAGE_VISIBILITY_STATE = 'page_visibility_state';

/** Returned by GET_SIGNED_TOKEN when the consumer provides no override. */
const DEFAULT_SIGNED_TOKEN = 'dev-signed-token';

// Per-type RESIZE bounds [min, max] in px (ADR-0006). Panel width is fixed
// (min === max), so RESIZE can never change it. Types are added here as their
// wrappers land; the surface selector and size validation derive from these keys.
const SURFACE_BOUNDS: Record<
  string,
  { width: [number, number]; height: [number, number] }
> = {
  'pd-mock-panel': { width: [385, 385], height: [100, 750] },
  'pd-mock-modal': { width: [320, Infinity], height: [120, Infinity] },
  'pd-mock-floating-window': { width: [200, 800], height: [70, 700] },
};
// A surface is identified by class (`pd-mock-panel`) OR id (`id="pd-mock-panel"`).
// The id form gets the same behaviour without the class-based host styles.
const SURFACE_SELECTOR = Object.keys(SURFACE_BOUNDS)
  .map((cls) => `.${cls}, #${cls}`)
  .join(', ');
const outOfRange = (value: number, min: number, max: number): boolean =>
  value < min || value > max;
// A modal's max is the live viewport: bounds use Infinity, resolved here.
const resolveMax = (max: number, viewport: number): number =>
  max === Infinity ? viewport : max;
// Human-readable surface name for diagnostics, e.g. 'pd-mock-panel' → 'panel'.
const surfaceName = (cls: string): string => cls.replace(/^pd-mock-/, '');
// The bounds key (class) for an element, or undefined if it is not a surface.
const surfaceTypeOf = (el: HTMLElement): string | undefined =>
  Object.keys(SURFACE_BOUNDS).find(
    (cls) => el.classList.contains(cls) || el.id === cls,
  );

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

const SNACKBAR_STYLES = `
  .pd-mock-layer {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    z-index: 2147483647;
    pointer-events: none;
  }
  .pd-mock-snackbar {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(90vw, 480px);
    padding: 9px 13px 9px 10px;
    border-radius: 10px;
    border: 1px solid var(--pd-mock-border);
    background: var(--pd-mock-bg);
    color: var(--pd-mock-fg);
    font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: var(--pd-mock-shadow);
    animation: pd-mock-in 0.18s ease-out;
  }
  .pd-mock-badge {
    flex: none;
    font: 700 9px/1 system-ui, sans-serif;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    padding: 3px 5px;
    border-radius: 5px;
    background: var(--pd-mock-badge-bg);
    color: var(--pd-mock-badge-fg);
  }
  .pd-mock-msg {
    flex: 1 1 auto;
  }
  .pd-mock-link {
    flex: none;
    color: var(--pd-mock-link);
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
  .pd-mock-link:hover {
    text-decoration: underline;
  }
  @keyframes pd-mock-in {
    from {
      transform: translateX(16px);
    }
    to {
      transform: none;
    }
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
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 520px;
    height: 400px;
    overflow: auto;
    background: #fff;
    border-radius: 4px;
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

// Confirmation dialog — a centred overlay in the shadow root (not a Surface).
const CONFIRMATION_STYLES = `
  .pd-mock-confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--pd-mock-backdrop);
  }
  .pd-mock-confirm {
    box-sizing: border-box;
    width: min(90vw, 360px);
    background: var(--pd-mock-surface-bg);
    color: var(--pd-mock-fg);
    border-radius: 4px;
    padding: 20px;
    box-shadow: 0 12px 40px rgba(20, 24, 31, 0.28);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    animation: pd-mock-pop 0.15s ease-out;
  }
  .pd-mock-confirm-title {
    margin: 0 0 6px;
    font-size: 16px;
    font-weight: 700;
  }
  .pd-mock-confirm-desc {
    margin: 0 0 16px;
    color: var(--pd-mock-muted);
  }
  .pd-mock-prefill {
    margin: 0 0 16px;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    font-size: 13px;
  }
  .pd-mock-prefill-key {
    color: var(--pd-mock-muted);
    font-weight: 600;
  }
  .pd-mock-prefill-val {
    margin: 0;
    color: var(--pd-mock-fg);
    word-break: break-word;
    white-space: pre-wrap;
  }
  .pd-mock-prefill-empty {
    margin: 0 0 16px;
    color: var(--pd-mock-muted);
    font-style: italic;
  }
  .pd-mock-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .pd-mock-confirm--custom {
    width: min(92vw, 560px);
  }
  .pd-mock-modal-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: -20px -20px 16px;
    padding: 11px 10px 11px 20px;
    border-bottom: 1px solid var(--pd-mock-border);
  }
  .pd-mock-modal-title {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pd-mock-modal-close {
    flex: none;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--pd-mock-muted);
    cursor: pointer;
    font: inherit;
    transition: background 0.12s ease, color 0.12s ease;
  }
  .pd-mock-modal-close::before {
    content: '\\2715';
    font-size: 16px;
    line-height: 1;
  }
  .pd-mock-modal-close:hover {
    background: rgba(20, 24, 31, 0.07);
    color: var(--pd-mock-fg);
  }
  .pd-mock-custom-frame {
    display: block;
    width: 100%;
    height: min(60vh, 300px);
    margin: 0 0 16px;
    border: 1px solid var(--pd-mock-border);
    border-radius: 8px;
  }
  .pd-mock-confirm-btn {
    font: inherit;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--pd-mock-border);
    background: var(--pd-mock-surface-bg);
    color: var(--pd-mock-fg);
    cursor: pointer;
  }
  .pd-mock-confirm-btn--ok {
    border-color: transparent;
    background: var(--pd-mock-accent);
    color: var(--pd-mock-accent-fg);
  }
  .pd-mock-confirm-btn--ok.is-negative {
    background: var(--pd-mock-negative);
  }
  @keyframes pd-mock-pop {
    from {
      transform: scale(0.96);
    }
    to {
      transform: none;
    }
  }
`;

// Host "chrome" indicators (notification badge, focus mode, redirect banner) —
// top-left, clear of the snackbar (bottom-right) and floating window (top-right).
const CHROME_STYLES = `
  .pd-mock-chrome {
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 2147483642;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    pointer-events: none;
    font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .pd-mock-chrome > * {
    pointer-events: auto;
  }
  .pd-mock-notification {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    box-sizing: border-box;
    border-radius: 10px;
    background: var(--pd-mock-negative);
    color: var(--pd-mock-accent-fg);
    font: 700 12px/20px system-ui, sans-serif;
    text-align: center;
  }
  .pd-mock-indicator {
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--pd-mock-indicator-bg);
    color: var(--pd-mock-indicator-fg);
    font-weight: 600;
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
    max-height: 500px;
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

  const calls: MockHostCall[] = [];

  // The Dev Tool's root and Active-Log elements; assigned when the Dev Tool is
  // built, null when it is off. `logToDevTool` prepends entries newest-first and
  // no-ops when there is no log to write to.
  let devToolElement: HTMLElement | null = null;
  let devToolLog: HTMLElement | null = null;
  // The focus-mode control row (shown only for a floating window) and the
  // observer that keeps surface-dependent controls in sync with the DOM.
  let devToolFocusRow: HTMLElement | null = null;
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

  // Open listener ports the App Extension registered via `sdk.listen`, keyed by
  // event name. `emit` pushes to every port for an event.
  const listeners = new Map<string, Set<MessagePort>>();

  // Push an event to every listener registered for it.
  const emitEvent = (eventName: string, eventData: unknown): void => {
    logToDevTool('host → app', 'event', eventName, eventData);
    const ports = listeners.get(eventName);
    if (!ports) {
      return;
    }
    for (const port of ports) {
      port.postMessage({ data: eventData });
    }
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
    toggle.addEventListener('click', () => {
      const collapsed = devToolEl.getAttribute('data-collapsed') === 'true';
      const next = !collapsed;
      devToolEl.setAttribute('data-collapsed', String(next));
      toggle.setAttribute('aria-expanded', String(!next));
      toggle.setAttribute(
        'aria-label',
        next ? 'Expand dev tool' : 'Collapse dev tool',
      );
      toggle.textContent = next ? '+' : '–';
    });
    header.appendChild(toggle);
    devToolEl.appendChild(header);

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
      applySize(
        {
          width: widthInput.value !== '' ? Number(widthInput.value) : undefined,
          height:
            heightInput.value !== '' ? Number(heightInput.value) : undefined,
        },
        'dev tool resize',
      );
    });
    resizeRow.append(resizeLabel, widthInput, heightInput, resizeApply);
    controls.appendChild(resizeRow);

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
    });
    focusRow.append(focusLabel, focusToggle);
    controls.appendChild(focusRow);
    devToolFocusRow = focusRow;

    const log = document.createElement('ul');
    log.className = 'pd-mock-dev-tool-log';
    log.setAttribute('aria-label', 'Active log');
    devToolLog = log;

    body.append(controls, log);
    devToolEl.appendChild(body);
    shadowRoot.appendChild(devToolEl);
  }

  // The snackbar layer is created lazily on first use; styles live in the shadow
  // root so consumer CSS cannot reach them (and vice versa).
  const ensureSnackbarLayer = (): HTMLElement => {
    const existing = shadowRoot.querySelector<HTMLElement>('.pd-mock-layer');
    if (existing) {
      return existing;
    }
    const style = document.createElement('style');
    style.textContent = SNACKBAR_STYLES;
    shadowRoot.appendChild(style);
    const layer = document.createElement('div');
    layer.className = 'pd-mock-layer';
    shadowRoot.appendChild(layer);
    return layer;
  };

  const renderSnackbar = (
    message: string,
    link?: { url: string; label: string },
  ): void => {
    const bar = document.createElement('div');
    bar.className = 'pd-mock-snackbar';
    bar.setAttribute('data-mock', 'snackbar');
    bar.setAttribute('role', 'status');

    const badge = document.createElement('span');
    badge.className = 'pd-mock-badge';
    badge.textContent = 'MOCK';
    bar.appendChild(badge);

    const text = document.createElement('span');
    text.className = 'pd-mock-msg';
    text.textContent = message;
    bar.appendChild(text);

    if (link) {
      const anchor = document.createElement('a');
      anchor.className = 'pd-mock-link';
      anchor.href = link.url;
      anchor.textContent = link.label;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      bar.appendChild(anchor);
    }

    ensureSnackbarLayer().appendChild(bar);
    // Snackbars dismiss themselves, like the real one.
    window.setTimeout(() => bar.remove(), 5000);
  };

  const ensureConfirmationStyles = (): void => {
    if (shadowRoot.querySelector('style[data-pd-mock="confirm-styles"]')) {
      return;
    }
    const style = document.createElement('style');
    style.setAttribute('data-pd-mock', 'confirm-styles');
    style.textContent = CONFIRMATION_STYLES;
    shadowRoot.appendChild(style);
  };

  const renderConfirmation = (
    args: ConfirmationArgs,
    onResolve: (confirmed: boolean) => void,
  ): void => {
    ensureConfirmationStyles();
    const backdrop = document.createElement('div');
    backdrop.className = 'pd-mock-confirm-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'pd-mock-confirm';
    dialog.setAttribute('role', 'dialog');

    const title = document.createElement('h2');
    title.className = 'pd-mock-confirm-title';
    title.textContent = args.title;
    dialog.appendChild(title);

    if (args.description) {
      const desc = document.createElement('p');
      desc.className = 'pd-mock-confirm-desc';
      desc.textContent = args.description;
      dialog.appendChild(desc);
    }

    const actions = document.createElement('div');
    actions.className = 'pd-mock-confirm-actions';

    const answer = (confirmed: boolean): void => {
      backdrop.remove();
      onResolve(confirmed);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'pd-mock-confirm-btn';
    cancelBtn.textContent = args.cancelText ?? 'Cancel';
    cancelBtn.addEventListener('click', () => answer(false));

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'pd-mock-confirm-btn pd-mock-confirm-btn--ok';
    if (args.okColor === 'negative') {
      okBtn.classList.add('is-negative');
    }
    okBtn.textContent = args.okText ?? 'OK';
    okBtn.addEventListener('click', () => answer(true));

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    dialog.appendChild(actions);

    backdrop.appendChild(dialog);
    shadowRoot.appendChild(backdrop);
  };

  // The currently open modal, if any, so CLOSE_MODAL can dismiss it.
  let resolveOpenModal: ((result: ModalResult) => void) | null = null;
  let removeOpenModal: (() => void) | null = null;
  // Which kind of modal is open, so CLOSE_MODAL (custom-modal-only) can tell
  // whether it applies. Entity modals (deal/person/…) are native Pipedrive
  // forms the app cannot close programmatically.
  let openModalKind: 'custom' | 'entity' | null = null;

  const closeModal = (result: ModalResult): void => {
    removeOpenModal?.();
    removeOpenModal = null;
    openModalKind = null;
    const resolve = resolveOpenModal;
    resolveOpenModal = null;
    resolve?.(result);
  };

  // The title bar Pipedrive frames a shadow-DOM modal dialog with: a title and a
  // close (X) button. Shared by the custom modal dialog.
  const buildModalHeader = (
    title: string,
    onClose: () => void,
  ): HTMLElement => {
    const header = document.createElement('div');
    header.className = 'pd-mock-modal-header';
    const titleEl = document.createElement('span');
    titleEl.className = 'pd-mock-modal-title';
    titleEl.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pd-mock-modal-close';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', onClose);
    header.append(titleEl, close);
    return header;
  };

  const openEntityModal = (
    attrs: ModalArgs,
    onResolve: (result: ModalResult) => void,
  ): void => {
    ensureConfirmationStyles();
    resolveOpenModal = onResolve;
    openModalKind = 'entity';

    const backdrop = document.createElement('div');
    backdrop.className = 'pd-mock-confirm-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'pd-mock-confirm';
    dialog.setAttribute('role', 'dialog');

    const title = document.createElement('h2');
    title.className = 'pd-mock-confirm-title';
    title.textContent = `Modal: ${attrs.type ?? ''}`;
    dialog.appendChild(title);

    const entries = Object.entries(attrs.prefill ?? {});
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pd-mock-prefill-empty';
      empty.textContent = '(no prefill)';
      dialog.appendChild(empty);
    } else {
      const prefill = document.createElement('dl');
      prefill.className = 'pd-mock-prefill';
      for (const [key, value] of entries) {
        const dt = document.createElement('dt');
        dt.className = 'pd-mock-prefill-key';
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.className = 'pd-mock-prefill-val';
        dd.textContent =
          typeof value === 'string' ? value : JSON.stringify(value);
        prefill.append(dt, dd);
      }
      dialog.appendChild(prefill);
    }

    const actions = document.createElement('div');
    actions.className = 'pd-mock-confirm-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pd-mock-confirm-btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => closeModal({ status: 'closed' }));
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'pd-mock-confirm-btn pd-mock-confirm-btn--ok';
    submitBtn.textContent = 'Submit';
    submitBtn.addEventListener('click', () =>
      closeModal({ status: 'submitted', id: 1 }),
    );
    actions.append(closeBtn, submitBtn);
    dialog.appendChild(actions);

    backdrop.appendChild(dialog);
    shadowRoot.appendChild(backdrop);
    removeOpenModal = () => backdrop.remove();
  };

  const resolveCustomModalUrl = (attrs: ModalArgs): string | undefined => {
    const cm = config.customModals;
    let url: string | undefined;
    if (typeof cm === 'function') {
      url = cm(attrs);
    } else if (cm && attrs.action_id) {
      url = cm[attrs.action_id];
    }
    return url ?? attrs.data?.url;
  };

  const openCustomModal = (
    attrs: ModalArgs,
    onResolve: (result: ModalResult) => void,
  ): void => {
    ensureConfirmationStyles();
    resolveOpenModal = onResolve;
    openModalKind = 'custom';

    const backdrop = document.createElement('div');
    backdrop.className = 'pd-mock-confirm-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'pd-mock-confirm pd-mock-confirm--custom';
    dialog.setAttribute('role', 'dialog');

    // Pipedrive frames a custom modal with a title bar and a close (X) button;
    // the X dismisses it, firing CLOSE_CUSTOM_MODAL just like the command does.
    dialog.appendChild(
      buildModalHeader(appName, () => {
        emitEvent(EVENT_CLOSE_CUSTOM_MODAL, undefined);
        closeModal({ status: 'closed' });
      }),
    );

    const url = resolveCustomModalUrl(attrs);
    if (url) {
      const iframe = document.createElement('iframe');
      iframe.className = 'pd-mock-custom-frame';
      iframe.title = 'custom modal';
      iframe.src = url;
      dialog.appendChild(iframe);
    } else {
      const placeholder = document.createElement('p');
      placeholder.textContent = `custom_modal: ${attrs.action_id ?? ''} (no URL configured)`;
      dialog.appendChild(placeholder);
    }

    backdrop.appendChild(dialog);
    shadowRoot.appendChild(backdrop);
    removeOpenModal = () => backdrop.remove();
  };

  // Lazily create the top-left chrome layer that holds host indicators.
  const ensureChrome = (): HTMLElement => {
    const existing = shadowRoot.querySelector<HTMLElement>('.pd-mock-chrome');
    if (existing) {
      return existing;
    }
    const style = document.createElement('style');
    style.setAttribute('data-pd-mock', 'chrome-styles');
    style.textContent = CHROME_STYLES;
    shadowRoot.appendChild(style);
    const chrome = document.createElement('div');
    chrome.className = 'pd-mock-chrome';
    shadowRoot.appendChild(chrome);
    return chrome;
  };

  // Where the App Extension renders. Auto-detect the first surface wrapper;
  // fall back to the document body (config.surface override is a later slice).
  const resolveSurface = (): HTMLElement =>
    document.querySelector<HTMLElement>(SURFACE_SELECTOR) ?? document.body;

  // The app's display name/icon shown in the surface header bar.
  const appName = config.appName ?? 'App Extension';
  const appIcon = config.appIcon ?? '◧';

  // Render the app icon as an <img> when it looks like a URL, otherwise as a
  // glyph/emoji. Returns null when no icon should be shown.
  const buildAppIcon = (): HTMLElement => {
    const isUrl = /^(https?:|data:|\/)/.test(appIcon);
    if (isUrl) {
      const img = document.createElement('img');
      img.className = 'pd-mock-surface-icon';
      img.src = appIcon;
      img.alt = '';
      return img;
    }
    const span = document.createElement('span');
    span.className = 'pd-mock-surface-icon';
    span.textContent = appIcon;
    return span;
  };

  // Build the host-injected header bar for a surface type. Pipedrive renders
  // this chrome outside the app's iframe in production; here it lives in the
  // surface's light DOM as the wrapper's first child (the consumer's content
  // flows below it).
  const buildSurfaceHeader = (el: HTMLElement, type: string): HTMLElement => {
    const header = document.createElement('div');
    header.className = 'pd-mock-surface-header';

    if (type === 'pd-mock-panel') {
      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'pd-mock-surface-btn pd-mock-surface-collapse';
      collapse.setAttribute('aria-label', 'Collapse');
      collapse.addEventListener('click', () => {
        const collapsed = el.classList.toggle('pd-mock-collapsed');
        collapse.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
        // Hiding/showing the panel changes the app's visibility, so tell it —
        // user-invoked, like closing a floating window (ADR-0006).
        emitEvent(EVENT_VISIBILITY, {
          is_visible: !collapsed,
          context: { invoker: 'user' },
        });
      });
      header.appendChild(collapse);
    }

    // Panel and floating window show the app icon next to the name; the modal
    // shows just the title (matching Pipedrive's chrome).
    if (type !== 'pd-mock-modal') {
      header.appendChild(buildAppIcon());
    }

    const title = document.createElement('span');
    title.className = 'pd-mock-surface-title';
    title.textContent = appName;
    header.appendChild(title);

    if (type === 'pd-mock-panel') {
      // Refresh reloads the page (Pipedrive reloads the app's iframe; the mock
      // shares the page, so it reloads the whole window). "More" is inert — there
      // is no menu — it exists so the panel chrome matches Pipedrive's.
      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.className = 'pd-mock-surface-btn pd-mock-surface-refresh';
      refresh.setAttribute('aria-label', 'Refresh');
      refresh.addEventListener('click', () => window.location.reload());
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'pd-mock-surface-btn pd-mock-surface-more';
      more.setAttribute('aria-label', 'More');
      header.append(refresh, more);
    }

    // Floating windows and modals carry an X. Closing a floating window fires a
    // user-invoked VISIBILITY; closing a (custom) modal fires CLOSE_CUSTOM_MODAL.
    const onClose =
      type === 'pd-mock-floating-window'
        ? (): void => {
            el.style.display = 'none';
            emitEvent(EVENT_VISIBILITY, {
              is_visible: false,
              context: { invoker: 'user' },
            });
          }
        : type === 'pd-mock-modal'
          ? (): void => {
              el.style.display = 'none';
              emitEvent(EVENT_CLOSE_CUSTOM_MODAL, undefined);
            }
          : undefined;
    if (onClose) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'pd-mock-surface-btn pd-mock-surface-close';
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('click', onClose);
      header.appendChild(close);
    }
    return header;
  };

  // Inject the header bar into every class-identified surface present. Idempotent
  // (one header per surface). The id form deliberately gets no header — like the
  // host styles, it is class-only (ADR-0006: id = behaviour without styling).
  const decorateSurfaces = (): void => {
    for (const type of Object.keys(SURFACE_BOUNDS)) {
      for (const el of document.querySelectorAll<HTMLElement>(`.${type}`)) {
        if (el.querySelector(':scope > .pd-mock-surface-header')) {
          continue;
        }
        el.insertBefore(buildSurfaceHeader(el, type), el.firstChild);
      }
    }
  };

  // Apply a size to the current surface. Each requested dimension must fall
  // within the surface type's bounds; if any is out of range the whole resize
  // is rejected (nothing applied) and a console error explains why — mirroring
  // real Pipedrive, which simply ignores an out-of-bounds size. Shared by RESIZE
  // and the initial size from initialize(). `context` names the caller for the
  // error message. Returns whether the size was applied.
  const applySize = (
    size: { width?: number; height?: number } | undefined,
    context: string,
  ): boolean => {
    if (!size) {
      return true;
    }
    const surface = resolveSurface();
    const type = surfaceTypeOf(surface);
    const bounds = type ? SURFACE_BOUNDS[type] : undefined;
    // Unknown surface (body fallback): no bounds to enforce, apply as-is.
    if (!bounds) {
      if (size.width != null) surface.style.width = `${size.width}px`;
      if (size.height != null) surface.style.height = `${size.height}px`;
      return true;
    }

    // Panel width is fixed (min === max), so the dimension is not resizable —
    // a requested width is ignored rather than treated as out of range.
    const widthFixed = bounds.width[0] === bounds.width[1];
    const widthMax = resolveMax(bounds.width[1], window.innerWidth);
    const heightMax = resolveMax(bounds.height[1], window.innerHeight);
    const errors: string[] = [];
    if (
      size.width != null &&
      !widthFixed &&
      outOfRange(size.width, bounds.width[0], widthMax)
    ) {
      errors.push(
        `width ${size.width}px is outside ${bounds.width[0]}–${widthMax}px`,
      );
    }
    if (
      size.height != null &&
      outOfRange(size.height, bounds.height[0], heightMax)
    ) {
      errors.push(
        `height ${size.height}px is outside ${bounds.height[0]}–${heightMax}px`,
      );
    }
    if (errors.length > 0) {
      console.error(
        `[pipedrive-mock-host] ${context} rejected: ${errors.join('; ')} for the ${surfaceName(type!)} surface.`,
      );
      return false;
    }

    if (size.width != null && !widthFixed)
      surface.style.width = `${size.width}px`;
    if (size.height != null) surface.style.height = `${size.height}px`;
    return true;
  };

  // Focus mode keeps the user from closing the floating window: its header close
  // button is disabled while on, and a "Focus mode" indicator shows (ADR-0008).
  // Shared by the SET_FOCUS_MODE command and the Dev Tool's focus toggle.
  const applyFocusMode = (enabled: boolean): void => {
    const closeBtn = resolveSurface().querySelector<HTMLButtonElement>(
      '.pd-mock-surface-close',
    );
    if (closeBtn) {
      closeBtn.disabled = enabled;
    }
    const chrome = ensureChrome();
    const existing = chrome.querySelector('.pd-mock-focus');
    if (enabled && !existing) {
      const indicator = document.createElement('div');
      indicator.className = 'pd-mock-indicator pd-mock-focus';
      indicator.textContent = 'Focus mode';
      chrome.appendChild(indicator);
    } else if (!enabled && existing) {
      existing.remove();
    }
  };

  // Guard for commands that only apply to a floating window (SHOW/HIDE_FLOATING
  // _WINDOW, SET_NOTIFICATION, SET_FOCUS_MODE — Pipedrive UI rules, not in the
  // SDK). Logs a diagnostic and returns false when the active surface is not a
  // floating window; the caller then replies without acting.
  const requireFloatingWindow = (command: string): boolean => {
    const active = resolveSurface();
    const type = surfaceTypeOf(active);
    if (type === 'pd-mock-floating-window') {
      return true;
    }
    console.error(
      `[pipedrive-mock-host] ${command} ignored: active surface is "${
        type ? surfaceName(type) : 'none'
      }", not a floating window.`,
    );
    return false;
  };

  const onMessage = (event: MessageEvent): void => {
    const data = event.data as
      | {
          payload?: {
            command?: string;
            event?: string;
            args?: unknown;
            type?: string;
          };
        }
      | undefined;
    const payload = data?.payload;
    if (!payload) {
      return;
    }

    // A listener registration: keep the port and push to it on emit().
    if (payload.type === MESSAGE_TYPE_LISTENER && payload.event) {
      const port = event.ports[0] as MessagePort | undefined;
      if (port) {
        const ports = listeners.get(payload.event) ?? new Set<MessagePort>();
        ports.add(port);
        listeners.set(payload.event, ports);
      }
      return;
    }

    // A fire-and-forget track (e.g. FOCUSED): record it, no reply.
    if (payload.type === MESSAGE_TYPE_TRACK && payload.event) {
      calls.push({ command: payload.event, args: undefined });
      logToDevTool('app → host', 'track', payload.event);
      return;
    }

    if (payload.type !== MESSAGE_TYPE_COMMAND || !payload.command) {
      return;
    }

    const port = event.ports[0] as MessagePort | undefined;
    const reply = (response?: unknown): void =>
      port?.postMessage({ data: response });

    calls.push({ command: payload.command, args: payload.args });
    logToDevTool('app → host', 'command', payload.command, payload.args);

    switch (payload.command) {
      case COMMAND_INITIALIZE: {
        // The handshake may carry an initial size; apply it to the surface.
        const args = payload.args as
          | { size?: { width?: number; height?: number } }
          | undefined;
        decorateSurfaces();
        applySize(args?.size, 'initialize');
        reply();
        break;
      }
      case COMMAND_SHOW_SNACKBAR: {
        const args = payload.args as
          | { message?: string; link?: { url: string; label: string } }
          | undefined;
        renderSnackbar(args?.message ?? '', args?.link);
        reply();
        break;
      }
      case COMMAND_SHOW_CONFIRMATION: {
        const args = payload.args as ConfirmationArgs;
        if (config.onConfirmation) {
          // Never leave the caller hanging: a throwing or rejecting override
          // resolves to "not confirmed".
          void (async () => {
            try {
              const confirmed = await config.onConfirmation!(args);
              reply({ confirmed: Boolean(confirmed) });
            } catch {
              reply({ confirmed: false });
            }
          })();
        } else {
          // Render an interactive dialog that resolves when the user answers.
          renderConfirmation(args, (confirmed) => reply({ confirmed }));
        }
        break;
      }
      case COMMAND_RESIZE: {
        applySize(
          payload.args as { width?: number; height?: number },
          'RESIZE',
        );
        reply();
        break;
      }
      case COMMAND_GET_SIGNED_TOKEN: {
        void (async () => {
          try {
            const token = config.getSignedToken
              ? await config.getSignedToken()
              : DEFAULT_SIGNED_TOKEN;
            reply({ token });
          } catch {
            // Never hang the caller: fall back to the default dev token.
            reply({ token: DEFAULT_SIGNED_TOKEN });
          }
        })();
        break;
      }
      case COMMAND_SET_NOTIFICATION: {
        if (!requireFloatingWindow('SET_NOTIFICATION')) {
          reply();
          break;
        }
        const args = payload.args as { number?: number } | undefined;
        const chrome = ensureChrome();
        let badge = chrome.querySelector<HTMLElement>('.pd-mock-notification');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'pd-mock-notification';
          chrome.appendChild(badge);
        }
        badge.textContent = args?.number != null ? String(args.number) : '';
        reply();
        break;
      }
      case COMMAND_OPEN_MODAL: {
        const attrs = payload.args as ModalArgs;
        if (config.onModal) {
          void (async () => {
            try {
              reply((await config.onModal!(attrs)) ?? { status: 'closed' });
            } catch {
              reply({ status: 'closed' });
            }
          })();
        } else if (attrs.type === 'custom_modal') {
          openCustomModal(attrs, (result) => reply(result));
        } else {
          openEntityModal(attrs, (result) => reply(result));
        }
        break;
      }
      case COMMAND_CLOSE_MODAL: {
        // CLOSE_MODAL only applies to custom modals; entity modals are native
        // Pipedrive forms the app cannot close. Report and do nothing else, but
        // still reply so the SDK promise resolves.
        if (openModalKind !== 'custom') {
          console.error(
            '[pipedrive-mock-host] CLOSE_MODAL ignored: no custom modal is open (CLOSE_MODAL applies only to custom modals).',
          );
          reply();
          break;
        }
        // Closing via command fires CLOSE_CUSTOM_MODAL, like the user's Close
        // button does.
        emitEvent(EVENT_CLOSE_CUSTOM_MODAL, undefined);
        closeModal({ status: 'closed' });
        reply();
        break;
      }
      case COMMAND_SHOW_FLOATING_WINDOW:
      case COMMAND_HIDE_FLOATING_WINDOW: {
        const visible = payload.command === COMMAND_SHOW_FLOATING_WINDOW;
        const command = visible
          ? 'SHOW_FLOATING_WINDOW'
          : 'HIDE_FLOATING_WINDOW';
        // The floating window is unavailable on a panel/modal: report it and do
        // nothing else (no DOM change, no misleading VISIBILITY event) — but
        // still reply so the SDK promise resolves.
        if (!requireFloatingWindow(command)) {
          reply();
          break;
        }
        // Toggle the active floating-window surface (matched by class or id).
        resolveSurface().style.display = visible ? '' : 'none';
        // Toggling the window's visibility fires a VISIBILITY event.
        emitEvent(EVENT_VISIBILITY, {
          is_visible: visible,
          context: { invoker: 'command' },
        });
        reply();
        break;
      }
      case COMMAND_REDIRECT_TO: {
        const args = payload.args as { view?: string } | undefined;
        const banner = document.createElement('div');
        banner.className = 'pd-mock-indicator pd-mock-redirect';
        banner.textContent = `Redirect → ${args?.view ?? ''}`;
        ensureChrome().appendChild(banner);
        window.setTimeout(() => banner.remove(), 4000);
        reply();
        break;
      }
      case COMMAND_SET_FOCUS_MODE: {
        if (!requireFloatingWindow('SET_FOCUS_MODE')) {
          reply();
          break;
        }
        applyFocusMode(payload.args === true);
        reply();
        break;
      }
      case COMMAND_GET_METADATA: {
        const surface = resolveSurface();
        reply({
          windowWidth: surface.offsetWidth,
          windowHeight: surface.offsetHeight,
        });
        break;
      }
      default:
        // Not-yet-implemented command. Reply with an empty object (not
        // undefined) so the SDK's promise resolves and consumer code that
        // destructures the result (e.g. `const { confirmed } = …`) does not
        // throw. Real responses arrive as each command is implemented.
        reply({});
    }
  };

  // Keep surface-dependent Dev Tool controls in sync with the active surface:
  // the focus-mode row shows only for a floating window. resolveSurface() is not
  // reactive and frameworks mount/unmount the wrapper, so watch the DOM (class/id
  // toggles included) and recompute. Cheap: one querySelector per mutation.
  if (devToolElement) {
    const refreshDevToolSurface = (): void => {
      if (devToolFocusRow) {
        devToolFocusRow.hidden =
          surfaceTypeOf(resolveSurface()) !== 'pd-mock-floating-window';
      }
    };
    refreshDevToolSurface();
    devToolObserver = new MutationObserver(refreshDevToolSurface);
    devToolObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'id'],
    });
  }

  window.addEventListener('message', onMessage);

  const handle: MockHost = {
    shadowRoot,
    emit(eventName, eventData) {
      emitEvent(eventName, eventData);
    },
    getCalls() {
      return [...calls];
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
      listeners.clear();
      activeHost = null;
    },
  };

  activeHost = handle;
  return handle;
}
