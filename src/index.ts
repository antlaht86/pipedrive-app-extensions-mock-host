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

/** Configuration for the Mock Host. Fields land incrementally; see the design. */
export interface MockHostConfig {
  /**
   * Headless override for `SHOW_CONFIRMATION`: return whether the user
   * confirmed. When omitted, an interactive dialog is rendered instead.
   */
  onConfirmation?: (args: ConfirmationArgs) => boolean | Promise<boolean>;
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
const COMMAND_SHOW_CONFIRMATION = 'show_confirmation';
const COMMAND_RESIZE = 'resize';
const COMMAND_GET_METADATA = 'get_metadata';

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

/**
 * Start the Mock Host: listen for the SDK's messages on `window` and answer
 * them. Returns a handle to inspect, drive and tear down the host.
 */
export function startPipedriveMockHost(config: MockHostConfig = {}): MockHost {
  // SSR-safe: with no window (e.g. Next.js server render) return an inert handle.
  if (typeof window === 'undefined') {
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

  const hostEl = document.createElement('pipedrive-mock-host');
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

  // Where the App Extension renders. Auto-detect the panel wrapper; fall back to
  // the document body (config.surface override is a later slice).
  const resolveSurface = (): HTMLElement =>
    document.querySelector<HTMLElement>('.pd-mock-panel') ?? document.body;

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
      case COMMAND_SHOW_CONFIRMATION: {
        const args = payload.args as ConfirmationArgs;
        if (config.onConfirmation) {
          Promise.resolve(config.onConfirmation(args)).then((confirmed) =>
            reply({ confirmed: Boolean(confirmed) }),
          );
        } else {
          // Render an interactive dialog that resolves when the user answers.
          renderConfirmation(args, (confirmed) => reply({ confirmed }));
        }
        break;
      }
      case COMMAND_RESIZE: {
        const args = payload.args as { height?: number } | undefined;
        if (args?.height != null) {
          const surface = resolveSurface();
          // A Custom Panel's height is clamped to 100–750px (width is fixed, so
          // RESIZE's width argument is ignored). Untyped surfaces resize freely.
          const isPanel = surface.classList.contains('pd-mock-panel');
          const height = isPanel
            ? Math.min(750, Math.max(100, args.height))
            : args.height;
          surface.style.height = `${height}px`;
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
    emit() {
      // Host-driven events land in a later slice.
    },
    getCalls() {
      return [...calls];
    },
    teardown() {
      window.removeEventListener('message', onMessage);
      hostEl.remove();
      surfaceStyleEl.remove();
      activeHost = null;
    },
  };

  activeHost = handle;
  return handle;
}
