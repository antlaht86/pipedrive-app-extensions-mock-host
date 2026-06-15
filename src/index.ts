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

  const renderSnackbar = (message: string): void => {
    const el = document.createElement('div');
    el.setAttribute('data-mock', 'snackbar');
    el.textContent = message;
    shadowRoot.appendChild(el);
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
        const args = payload.args as { message?: string } | undefined;
        renderSnackbar(args?.message ?? '');
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
