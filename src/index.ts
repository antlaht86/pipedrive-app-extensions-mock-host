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

/** Returned by GET_SIGNED_TOKEN when the consumer provides no override. */
const DEFAULT_SIGNED_TOKEN = 'dev-signed-token';

// Per-type RESIZE bounds [min, max] in px (ADR-0006). Panel width is fixed
// (min === max), so RESIZE can never change it. Types are added here as their
// wrappers land; the surface selector and clamping derive from these keys.
const SURFACE_BOUNDS: Record<
  string,
  { width: [number, number]; height: [number, number] }
> = {
  'pd-mock-panel': { width: [385, 385], height: [100, 750] },
  'pd-mock-modal': { width: [320, Infinity], height: [120, Infinity] },
  'pd-mock-floating-window': { width: [200, 800], height: [70, 700] },
};
const SURFACE_SELECTOR = Object.keys(SURFACE_BOUNDS)
  .map((cls) => `.${cls}`)
  .join(', ');
const clampToRange = (value: number, [min, max]: [number, number]): number =>
  Math.min(max, Math.max(min, value));
// A modal's max is the live viewport: bounds use Infinity, resolved here.
const resolveMax = (max: number, viewport: number): number =>
  max === Infinity ? viewport : max;

// Scoped to the shadow root — a calm, grey, clearly-a-mock surface. The palette
// lives in CSS custom properties on :host so themes can override it later.
const SNACKBAR_STYLES = `
  :host {
    --pd-mock-bg: #e9ebee;
    --pd-mock-fg: #20242b;
    --pd-mock-border: #d2d6dc;
    --pd-mock-badge-bg: #4a5159;
    --pd-mock-badge-fg: #f4f5f6;
    --pd-mock-link: #2563eb;
    --pd-mock-shadow: 0 6px 20px rgba(20, 24, 31, 0.18);
  }
  :host([data-theme='dark']) {
    --pd-mock-bg: #2b2f36;
    --pd-mock-fg: #eef1f4;
    --pd-mock-border: #3a4047;
    --pd-mock-link: #8ab4ff;
  }
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
    border-radius: 8px;
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
    border-radius: 12px;
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
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(20, 24, 31, 0.22);
    z-index: 2147483640;
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
    background: rgba(20, 24, 31, 0.35);
  }
  .pd-mock-confirm {
    box-sizing: border-box;
    width: min(90vw, 360px);
    background: #fff;
    color: #20242b;
    border-radius: 12px;
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
    color: #5b626b;
  }
  .pd-mock-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .pd-mock-confirm--custom {
    width: min(92vw, 560px);
  }
  .pd-mock-custom-frame {
    display: block;
    width: 100%;
    height: min(60vh, 300px);
    margin: 0 0 16px;
    border: 1px solid #e3e6ea;
    border-radius: 8px;
  }
  .pd-mock-confirm-btn {
    font: inherit;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid #d2d6dc;
    background: #fff;
    color: #20242b;
    cursor: pointer;
  }
  .pd-mock-confirm-btn--ok {
    border-color: transparent;
    background: #2563eb;
    color: #fff;
  }
  .pd-mock-confirm-btn--ok.is-negative {
    background: #d6453d;
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
    background: #d6453d;
    color: #fff;
    font: 700 12px/20px system-ui, sans-serif;
    text-align: center;
  }
  .pd-mock-indicator {
    padding: 4px 10px;
    border-radius: 6px;
    background: #23272e;
    color: #fff;
    font-weight: 600;
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
  // Open listener ports the App Extension registered via `sdk.listen`, keyed by
  // event name. `emit` pushes to every port for an event.
  const listeners = new Map<string, Set<MessagePort>>();

  // Push an event to every listener registered for it.
  const emitEvent = (eventName: string, eventData: unknown): void => {
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
  document.body.appendChild(hostEl);

  // Surface-wrapper styles live in the light DOM, since they target the
  // consumer's own element (e.g. <div class="pd-mock-panel">).
  const surfaceStyleEl = document.createElement('style');
  surfaceStyleEl.setAttribute('data-pd-mock', 'surface-styles');
  surfaceStyleEl.textContent = SURFACE_STYLES;
  document.head.appendChild(surfaceStyleEl);

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

  const closeModal = (result: ModalResult): void => {
    removeOpenModal?.();
    removeOpenModal = null;
    const resolve = resolveOpenModal;
    resolveOpenModal = null;
    resolve?.(result);
  };

  const openEntityModal = (
    attrs: ModalArgs,
    onResolve: (result: ModalResult) => void,
  ): void => {
    ensureConfirmationStyles();
    resolveOpenModal = onResolve;

    const backdrop = document.createElement('div');
    backdrop.className = 'pd-mock-confirm-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'pd-mock-confirm';
    dialog.setAttribute('role', 'dialog');

    const title = document.createElement('h2');
    title.className = 'pd-mock-confirm-title';
    title.textContent = `Modal: ${attrs.type ?? ''}`;
    dialog.appendChild(title);

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

    const backdrop = document.createElement('div');
    backdrop.className = 'pd-mock-confirm-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'pd-mock-confirm pd-mock-confirm--custom';
    dialog.setAttribute('role', 'dialog');

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

    const actions = document.createElement('div');
    actions.className = 'pd-mock-confirm-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pd-mock-confirm-btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      emitEvent(EVENT_CLOSE_CUSTOM_MODAL, undefined);
      closeModal({ status: 'closed' });
    });
    actions.appendChild(closeBtn);
    dialog.appendChild(actions);

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

  // Apply a size to the current surface, clamping each dimension to the surface
  // type's bounds. Shared by RESIZE and the initial size from initialize().
  const applySize = (size?: { width?: number; height?: number }): void => {
    if (!size) {
      return;
    }
    const surface = resolveSurface();
    const type = Object.keys(SURFACE_BOUNDS).find((cls) =>
      surface.classList.contains(cls),
    );
    const bounds = type ? SURFACE_BOUNDS[type] : undefined;
    if (size.width != null) {
      surface.style.width = `${
        bounds
          ? clampToRange(size.width, [
              bounds.width[0],
              resolveMax(bounds.width[1], window.innerWidth),
            ])
          : size.width
      }px`;
    }
    if (size.height != null) {
      surface.style.height = `${
        bounds
          ? clampToRange(size.height, [
              bounds.height[0],
              resolveMax(bounds.height[1], window.innerHeight),
            ])
          : size.height
      }px`;
    }
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
      return;
    }

    if (payload.type !== MESSAGE_TYPE_COMMAND || !payload.command) {
      return;
    }

    const port = event.ports[0] as MessagePort | undefined;
    const reply = (response?: unknown): void =>
      port?.postMessage({ data: response });

    calls.push({ command: payload.command, args: payload.args });

    switch (payload.command) {
      case COMMAND_INITIALIZE: {
        // The handshake may carry an initial size; apply it to the surface.
        const args = payload.args as
          | { size?: { width?: number; height?: number } }
          | undefined;
        applySize(args?.size);
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
        applySize(payload.args as { width?: number; height?: number });
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
        closeModal({ status: 'closed' });
        reply();
        break;
      }
      case COMMAND_SHOW_FLOATING_WINDOW:
      case COMMAND_HIDE_FLOATING_WINDOW: {
        const visible = payload.command === COMMAND_SHOW_FLOATING_WINDOW;
        const fw = document.querySelector<HTMLElement>(
          '.pd-mock-floating-window',
        );
        if (fw) {
          fw.style.display = visible ? '' : 'none';
        }
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
        const enabled = payload.args === true;
        const chrome = ensureChrome();
        const existing = chrome.querySelector('.pd-mock-focus');
        if (enabled && !existing) {
          const el = document.createElement('div');
          el.className = 'pd-mock-indicator pd-mock-focus';
          el.textContent = 'Focus mode';
          chrome.appendChild(el);
        } else if (!enabled && existing) {
          existing.remove();
        }
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

  window.addEventListener('message', onMessage);

  const handle: MockHost = {
    shadowRoot,
    emit(eventName, eventData) {
      emitEvent(eventName, eventData);
    },
    getCalls() {
      return [...calls];
    },
    teardown() {
      window.removeEventListener('message', onMessage);
      hostEl.remove();
      surfaceStyleEl.remove();
      listeners.clear();
      activeHost = null;
    },
  };

  activeHost = handle;
  return handle;
}
