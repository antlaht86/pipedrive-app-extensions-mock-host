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

/** Configuration for the Mock Host. Fields land incrementally; see the design. */
export interface MockHostConfig {
  /** Reserved for future configuration (surface, theme, resolvers, …). */
  readonly reserved?: never;
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
const COMMAND_INITIALIZE = 'initialize';
const COMMAND_SHOW_SNACKBAR = 'show_snackbar';

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

/**
 * Start the Mock Host: listen for the SDK's messages on `window` and answer
 * them. Returns a handle to inspect, drive and tear down the host.
 */
export function startPipedriveMockHost(_config?: MockHostConfig): MockHost {
  // SSR-safe: with no window (e.g. Next.js server render) return an inert handle.
  if (typeof window === 'undefined') {
    return NOOP_HOST;
  }

  const calls: MockHostCall[] = [];

  const hostEl = document.createElement('pipedrive-mock-host');
  const shadowRoot = hostEl.attachShadow({ mode: 'open' });
  document.body.appendChild(hostEl);

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

  const onMessage = (event: MessageEvent): void => {
    const data = event.data as
      | { payload?: { command?: string; args?: unknown; type?: string } }
      | undefined;
    const payload = data?.payload;
    if (!payload || payload.type !== MESSAGE_TYPE_COMMAND || !payload.command) {
      return;
    }

    const port = event.ports[0] as MessagePort | undefined;
    const reply = (response?: unknown): void =>
      port?.postMessage({ data: response });

    calls.push({ command: payload.command, args: payload.args });

    switch (payload.command) {
      case COMMAND_INITIALIZE:
        reply();
        break;
      case COMMAND_SHOW_SNACKBAR: {
        const args = payload.args as
          | { message?: string; link?: { url: string; label: string } }
          | undefined;
        renderSnackbar(args?.message ?? '', args?.link);
        reply();
        break;
      }
      default:
        // Reply void so the SDK's promise resolves rather than hanging.
        reply();
    }
  };

  window.addEventListener('message', onMessage);

  return {
    shadowRoot,
    emit() {
      // Host-driven events land in a later slice.
    },
    getCalls() {
      return [...calls];
    },
    teardown() {
      window.removeEventListener('message', onMessage);
      hostEl.remove();
    },
  };
}
