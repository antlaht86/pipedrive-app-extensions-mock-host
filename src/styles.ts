/**
 * Host-shell stylesheets the entry injects at start-up: the shadow-root palette
 * and the light-DOM Surface wrappers. Kept here so `index.ts` reads as assembly,
 * not styling. (Overlay CSS lives with host-effects; the Dev Tool's CSS lives with
 * the Dev Tool — each style block travels with the module that injects it.)
 */

// Scoped to the shadow root — a calm, grey, clearly-a-mock surface. The palette
// lives in CSS custom properties on :host so themes can override it later.
// The full palette for every host UI element, as CSS custom properties on the
// shadow host. Injected eagerly so all components (snackbar, confirmation,
// modal, chrome) resolve them regardless of render order. Consumers override any
// of these on the <pipedrive-mock-host> element (custom properties pierce the
// shadow boundary) — e.g. `pipedrive-mock-host { --pd-mock-accent: #f06; }`.
export const HOST_VARS_STYLES = `
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
export const SURFACE_STYLES = `
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
