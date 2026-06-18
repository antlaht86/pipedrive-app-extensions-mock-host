import { createEvents, type Events, type LogFn } from './events.js';
import type { ConfirmationArgs, MockHostConfig } from './index.js';
import { createModal, type Modal } from './modal.js';
import {
  applySize,
  resolveSurface,
  SURFACE_BOUNDS,
  surfaceName,
  surfaceTypeOf,
} from './surface.js';
import {
  DEFAULT_SIGNED_TOKEN,
  EVENT_CLOSE_CUSTOM_MODAL,
  EVENT_VISIBILITY,
} from './wire.js';

/**
 * host-effects — the seam between the Command intake and the effects only the
 * host can produce (CONTEXT.md). Grouped as the Surface, Event push, the host's
 * own overlays, and the consumer's config. The Dev Tool drives this same seam
 * (ADR-0009). Built over a real shadow root, so tests can construct it directly.
 */
export interface HostEffects {
  /** The Surface itself (CONTEXT.md): its type, size and visibility. */
  readonly surface: {
    /** The active surface's type (`pd-mock-panel` …), or undefined if none. */
    type(): string | undefined;
    /**
     * Resize the active surface within its type's bounds. An out-of-bounds
     * dimension rejects the whole resize (ADR-0006). `context` names the caller
     * for the diagnostic. Returns whether the size was applied.
     */
    resize(
      size: { width?: number; height?: number } | undefined,
      context: string,
    ): boolean;
    /** Show/hide the floating window and tell the app via VISIBILITY. */
    setFloatingWindowVisible(visible: boolean): void;
    /**
     * True when the active surface is a Floating Window. Otherwise logs a
     * dev diagnostic naming `command` and returns false (ADR-0008).
     */
    requireFloatingWindow(command: string): boolean;
  };
  /** Host-injected UI around the app: the surface header bars and page-corner
   * indicators. None of this is the app's own content. */
  readonly chrome: {
    /** Inject the host title bar onto each class-identified surface (idempotent). */
    decorate(): void;
    /** Toggle focus mode: disable the window's close (X) and show an indicator. */
    setFocusMode(enabled: boolean): void;
    /** Set (or clear) the floating window's notification badge. */
    setNotification(count: number | undefined): void;
    /** Show a transient redirect banner. */
    redirect(view: string): void;
  };
  /** The host's own pop-up UI — everything here draws an overlay on demand. */
  readonly overlays: {
    /** Render a transient snackbar at the browser's bottom-right. */
    snackbar(message: string, link?: { url: string; label: string }): void;
    /** Ask the user to confirm; resolves the answer (override or interactive). */
    confirmation(args: ConfirmationArgs): Promise<boolean>;
    /** The Modal (Custom / Entity); open one and resolve it, or close the custom. */
    modal: Modal;
  };
  /** The host-initiated Event channel (CONTEXT.md "Event"). */
  readonly events: Events;
  /**
   * The HOSTING WINDOW dimensions (CONTEXT.md) — not the surface size; in dev the
   * browser viewport. Apps size a surface relative to these (`windowHeight * 0.9`).
   */
  hostingWindow(): { windowWidth: number; windowHeight: number };
  /** The dev signed token (config override or the default). Never rejects. */
  signedToken(): Promise<string>;
  /** The consumer's configuration and headless overrides. */
  readonly config: MockHostConfig;
}

export interface HostEffectsDeps {
  readonly shadowRoot: ShadowRoot;
  readonly config: MockHostConfig;
  /** Optional Active-Log writer, threaded into Event push. */
  readonly log?: LogFn;
}

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

// Shared centred-dialog stylesheet — the backdrop, dialog box, buttons and pop
// animation used by both the confirmation dialog and the Modal.
const DIALOG_STYLES = `
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

// Host "chrome" indicators (notification badge, focus mode, redirect banner).
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

/** Build the concrete host-effects for one running host (or one test). */
export function createHostEffects(deps: HostEffectsDeps): HostEffects {
  const { shadowRoot, config } = deps;
  const events = createEvents({ log: deps.log });

  // The app's display name/icon shown in the surface header bar.
  const appName = config.appName ?? 'App Extension';
  const appIcon = config.appIcon ?? '◧';

  // ─── Snackbar ──────────────────────────────────────────────────────────────
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

  const snackbar = (
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

  // ─── Centred dialogs: confirmation + Modal share a shell and a stylesheet ────
  const ensureDialogStyles = (): void => {
    if (shadowRoot.querySelector('style[data-pd-mock="dialog-styles"]')) {
      return;
    }
    const style = document.createElement('style');
    style.setAttribute('data-pd-mock', 'dialog-styles');
    style.textContent = DIALOG_STYLES;
    shadowRoot.appendChild(style);
  };

  // The shared shell for the confirmation, entity-modal and custom-modal dialogs:
  // a backdrop and a dialog box. Each caller fills the dialog differently (title,
  // prefill, iframe); `extraClass` widens the custom modal.
  const createDialogShell = (
    extraClass?: string,
  ): { backdrop: HTMLElement; dialog: HTMLElement } => {
    const backdrop = document.createElement('div');
    backdrop.className = 'pd-mock-confirm-backdrop';
    const dialog = document.createElement('div');
    dialog.className = extraClass
      ? `pd-mock-confirm ${extraClass}`
      : 'pd-mock-confirm';
    dialog.setAttribute('role', 'dialog');
    return { backdrop, dialog };
  };

  const renderConfirmation = (
    args: ConfirmationArgs,
    onResolve: (confirmed: boolean) => void,
  ): void => {
    ensureDialogStyles();
    const { backdrop, dialog } = createDialogShell();

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

  const confirmation = (args: ConfirmationArgs): Promise<boolean> => {
    if (config.onConfirmation) {
      // Never leave the caller hanging: a throwing or rejecting override
      // resolves to "not confirmed".
      return (async () => {
        try {
          return Boolean(await config.onConfirmation!(args));
        } catch {
          return false;
        }
      })();
    }
    // Render an interactive dialog that resolves when the user answers.
    return new Promise<boolean>((resolve) => renderConfirmation(args, resolve));
  };

  // The Modal owns its own open/close state; it renders through the shared dialog
  // shell and emits CLOSE_CUSTOM_MODAL via the host's Event channel.
  const modal = createModal({
    shadowRoot,
    config,
    appName,
    emitClose: () => events.emit(EVENT_CLOSE_CUSTOM_MODAL, undefined),
    ensureDialogStyles,
    createDialogShell,
  });

  // ─── Chrome layer (notification, focus indicator, redirect banner) ───────────
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

  const redirect = (view: string): void => {
    const banner = document.createElement('div');
    banner.className = 'pd-mock-indicator pd-mock-redirect';
    banner.textContent = `Redirect → ${view}`;
    ensureChrome().appendChild(banner);
    window.setTimeout(() => banner.remove(), 4000);
  };

  const setNotification = (count: number | undefined): void => {
    const chrome = ensureChrome();
    let badge = chrome.querySelector<HTMLElement>('.pd-mock-notification');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'pd-mock-notification';
      chrome.appendChild(badge);
    }
    badge.textContent = count != null ? String(count) : '';
  };

  // ─── Surface chrome (header bars) ────────────────────────────────────────────
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
        events.emit(EVENT_VISIBILITY, {
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
            events.emit(EVENT_VISIBILITY, {
              is_visible: false,
              context: { invoker: 'user' },
            });
          }
        : type === 'pd-mock-modal'
          ? (): void => {
              el.style.display = 'none';
              events.emit(EVENT_CLOSE_CUSTOM_MODAL, undefined);
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

  const decorate = (): void => {
    // Derived from SURFACE_BOUNDS (single source of truth) so a new surface type
    // gets its header chrome automatically.
    for (const type of Object.keys(SURFACE_BOUNDS)) {
      for (const el of document.querySelectorAll<HTMLElement>(`.${type}`)) {
        if (el.querySelector(':scope > .pd-mock-surface-header')) {
          continue;
        }
        el.insertBefore(buildSurfaceHeader(el, type), el.firstChild);
      }
    }
  };

  // ─── Surface-scoped commands ─────────────────────────────────────────────────
  const requireFloatingWindow = (command: string): boolean => {
    const type = surfaceTypeOf(resolveSurface());
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

  const setFloatingWindowVisible = (visible: boolean): void => {
    resolveSurface().style.display = visible ? '' : 'none';
    events.emit(EVENT_VISIBILITY, {
      is_visible: visible,
      context: { invoker: 'command' },
    });
  };

  const setFocusMode = (enabled: boolean): void => {
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

  return {
    config,
    events,
    surface: {
      type: () => surfaceTypeOf(resolveSurface()),
      resize: applySize,
      setFloatingWindowVisible,
      requireFloatingWindow,
    },
    chrome: {
      decorate,
      setFocusMode,
      setNotification,
      redirect,
    },
    overlays: {
      snackbar,
      confirmation,
      modal,
    },
    hostingWindow: () => ({
      windowWidth: Math.round(window.innerWidth),
      windowHeight: Math.round(window.innerHeight),
    }),
    signedToken: async () => {
      try {
        return config.getSignedToken
          ? await config.getSignedToken()
          : DEFAULT_SIGNED_TOKEN;
      } catch {
        // Never hang the caller: fall back to the default dev token.
        return DEFAULT_SIGNED_TOKEN;
      }
    },
  };
}
