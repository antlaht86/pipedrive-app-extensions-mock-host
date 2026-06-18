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
// host can produce, also driven by the Dev Tool), Event push, the Surface helpers,
// the Active Log and the Dev Tool overlay. This entry just assembles them. See
// CONTEXT.md and docs/plans/2026-06-18-command-intake-seam.md.
import { createActiveLog } from './active-log.js';
import { createDevTool, type DevTool } from './dev-tool.js';
import { createHostEffects } from './host-effects.js';
import { createRouter, type ParsedMessage } from './router.js';
import { HOST_VARS_STYLES, SURFACE_STYLES } from './styles.js';

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

  // The Active Log (CONTEXT.md) is created first when the Dev Tool is on, so the
  // same `write` can be handed to the host-effects, the router and the Dev Tool;
  // with the Dev Tool off there is no log and the others no-op.
  const activeLog = config.devTool !== false ? createActiveLog() : null;

  // The host-effects (Surface, Event push, overlays, config) and the Message
  // router that drives them. The window transport (below) and the Dev Tool both
  // feed this same seam.
  const host = createHostEffects({ shadowRoot, config, log: activeLog?.write });
  const router = createRouter({ host, log: activeLog?.write });

  // Dev Tool: the host's own control overlay, mounted into the shadow root so it
  // needs no consumer markup; it drives only host-producible effects via the
  // host-effects seam, never a faked Command (ADR-0009). On by default.
  let devTool: DevTool | null = null;
  if (activeLog) {
    devTool = createDevTool({
      root: shadowRoot,
      host,
      log: activeLog,
      options: typeof config.devTool === 'object' ? config.devTool : {},
    });
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
    // `noUncheckedIndexedAccess` already types this `MessagePort | undefined`.
    const port = event.ports[0];
    router.dispatch(
      payload,
      (response) => port?.postMessage({ data: response }),
      port,
    );
  };

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
        devTool?.setPosition(position);
      },
    },
    teardown() {
      window.removeEventListener('message', onMessage);
      devTool?.teardown();
      hostEl.remove();
      surfaceStyleEl.remove();
      host.events.clear();
      activeHost = null;
    },
  };

  activeHost = handle;
  return handle;
}
