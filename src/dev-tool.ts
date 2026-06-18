import type { ActiveLog } from './active-log.js';
import type { HostEffects } from './host-effects.js';
import type { DevToolPosition } from './index.js';
import { resolveSurface } from './surface.js';
import {
  EVENT_PAGE_VISIBILITY_STATE,
  EVENT_USER_SETTINGS_CHANGE,
  EVENT_VISIBILITY,
} from './wire.js';

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

/** How the Dev Tool overlay is configured (the object form of `config.devTool`). */
export interface DevToolOptions {
  /** Corner the Dev Tool anchors to. Defaults to `'bottom-left'`. */
  position?: DevToolPosition;
  /** Start the Dev Tool collapsed to its launcher. Defaults to `false`. */
  startCollapsed?: boolean;
}

export interface DevToolDeps {
  /** Shadow root the Dev Tool mounts its style and overlay into. */
  readonly root: ShadowRoot;
  /** The host-effects seam the controls drive (ADR-0009: host-producible only). */
  readonly host: HostEffects;
  /** The Active Log this Dev Tool renders and writes its own actions to. */
  readonly log: ActiveLog;
  readonly options: DevToolOptions;
}

/** Runtime handle for a mounted Dev Tool. */
export interface DevTool {
  /** Move the overlay to a corner at runtime. */
  setPosition(position: DevToolPosition): void;
  /** Stop the surface observer (the overlay DOM goes with the shadow root). */
  teardown(): void;
}

/**
 * Build and mount the Dev Tool: an interactive overlay the developer uses to push
 * Events to the App Extension, resize the Surface and toggle focus mode, plus the
 * Active Log. It drives only effects the host can produce on its own (it never
 * fakes a Command), so every control routes through the host-effects seam.
 */
export function createDevTool(deps: DevToolDeps): DevTool {
  const { root, host, log, options } = deps;
  const position = options.position ?? 'bottom-left';

  const style = document.createElement('style');
  style.textContent = DEV_TOOL_STYLES;
  root.appendChild(style);

  const devToolEl = document.createElement('section');
  devToolEl.className = 'pd-mock-dev-tool';
  devToolEl.setAttribute('aria-label', 'Mock host dev tool');
  devToolEl.setAttribute('data-position', position);

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

  // The whole header row toggles collapse — not just the +/- button — so the user
  // need not aim at the small button. The button lives inside the header, so its
  // click (incl. keyboard activation) bubbles here and is handled once; it keeps
  // its own aria-expanded for assistive tech.
  header.addEventListener('click', () => {
    setCollapsed(devToolEl.getAttribute('data-collapsed') !== 'true');
  });

  // Start collapsed if requested (the toggle's click logic reads this attr).
  if (options.startCollapsed) {
    setCollapsed(true);
  }

  // Two columns: Controls on the left, the Active Log on the right.
  const body = document.createElement('div');
  body.className = 'pd-mock-dev-tool-body';

  const controls = document.createElement('div');
  controls.className = 'pd-mock-dev-tool-controls';
  controls.setAttribute('aria-label', 'Controls');

  // An event-emitter row: a label, one select per payload field, and an Emit
  // button that pushes the SDK-shaped payload through the host's Event channel.
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
      host.events.emit(eventName, buildPayload(selects.map((s) => s.value)));
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

  // Resize — width/height inputs that resize the active surface. host.surface
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
      height: heightInput.value !== '' ? Number(heightInput.value) : undefined,
    };
    if (host.surface.resize(size, 'dev tool resize')) {
      log.write('dev tool', 'action', 'resize', size);
    }
  });
  resizeRow.append(resizeLabel, widthInput, heightInput, resizeApply);
  controls.appendChild(resizeRow);

  // Focus mode — floating-window only, so this row is hidden for other surfaces
  // (toggled by refreshForSurface below).
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
    host.surface.setFocusMode(on);
    log.write('dev tool', 'action', 'focus mode', { enabled: on });
  });
  focusRow.append(focusLabel, focusToggle);
  controls.appendChild(focusRow);

  // Floating window visibility — floating-window only. Reads the surface's current
  // display so it stays correct even if hidden via the header X.
  const windowRow = document.createElement('div');
  windowRow.className = 'pd-mock-dev-tool-control';
  windowRow.hidden = true;
  const windowLabel = document.createElement('span');
  windowLabel.className = 'pd-mock-dev-tool-control-label';
  windowLabel.textContent = 'Floating window';
  const windowToggle = document.createElement('button');
  windowToggle.type = 'button';
  windowToggle.setAttribute('aria-label', 'Toggle floating window visibility');
  windowToggle.textContent = 'Visible';
  windowToggle.addEventListener('click', () => {
    const hidden = resolveSurface().style.display === 'none';
    host.surface.setFloatingWindowVisible(hidden);
    windowToggle.textContent = hidden ? 'Visible' : 'Hidden';
  });
  windowRow.append(windowLabel, windowToggle);
  controls.appendChild(windowRow);

  body.append(controls, log.element);
  devToolEl.appendChild(body);
  root.appendChild(devToolEl);

  // Keep surface-dependent controls in sync with the active surface: the focus
  // and floating-window rows show only for a floating window, and the resize row
  // disables with no active surface. resolveSurface() is not reactive and
  // frameworks mount/unmount the wrapper, so watch the DOM (class/id/style
  // toggles) and recompute. Cheap: one querySelector per mutation.
  const refreshForSurface = (): void => {
    const type = host.surface.type();
    const isFloatingWindow = type === 'pd-mock-floating-window';
    focusRow.hidden = !isFloatingWindow;
    windowRow.hidden = !isFloatingWindow;
    windowToggle.textContent =
      resolveSurface().style.display === 'none' ? 'Hidden' : 'Visible';
    // No surface (body fallback) → nothing to size, so disable the control.
    const hasSurface = type !== undefined;
    widthInput.disabled = !hasSurface;
    heightInput.disabled = !hasSurface;
    resizeApply.disabled = !hasSurface;
    resizeLabel.textContent = hasSurface ? 'Resize' : 'No surface';
  };
  refreshForSurface();
  const observer = new MutationObserver(refreshForSurface);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    // 'style' so the window toggle's label re-syncs when the surface is hidden
    // via its header X (a display change, not a class/id change).
    attributeFilter: ['class', 'id', 'style'],
  });

  return {
    setPosition(next) {
      devToolEl.setAttribute('data-position', next);
    },
    teardown() {
      observer.disconnect();
    },
  };
}
