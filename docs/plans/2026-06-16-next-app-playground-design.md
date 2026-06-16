# Next.js demo app — three surface playgrounds

Date: 2026-06-16. Status: design agreed via grilling session.

Goal: three pages in `testing/next-app` — **panel**, **modal**, **floating
window** — each exercising **all** Mock Host functionality, with a "what was
pressed" log modeled on `testing/index.html`.

## Locked decisions

1. **Dependencies.** `testing/next-app/package.json` adds
   `@pipedrive/app-extensions-sdk` (`^0.16.0`) and
   `pipedrive-app-extensions-mock-host` (`file:../..`). Import by package name —
   the realistic consumer setup. Requires `npm run build` at the repo root first
   (so `dist` exists for the `file:` dependency), then `npm install` in
   `testing/next-app`.
2. **Structure.** One client component `MockHostPlayground` parameterized by
   surface type renders every control + the log. Three thin Pages-Router routes
   (`/panel`, `/modal`, `/floating-window`) render it with the right surface and
   initial size. The index page links the three (nav).
3. **Custom modal.** `config.customModals = { 'demo-modal': '/custom-modal' }`,
   pointing at a small Next route `src/pages/custom-modal.tsx` the iframe loads.
4. **Styling.** Tailwind 4 (already configured). The log behaves like
   `index.html` — newest entry on top, dark panel.

## File layout

```
testing/next-app/src/
  components/MockHostPlayground.tsx   # 'use client' — all controls + log
  pages/
    index.tsx            # nav: links to /panel, /modal, /floating-window
    panel.tsx            # <MockHostPlayground surface="panel" />
    modal.tsx            # <MockHostPlayground surface="modal" />
    floating-window.tsx  # <MockHostPlayground surface="floating-window" />
    custom-modal.tsx     # iframe content for OPEN_MODAL custom_modal
```

## MockHostPlayground (client component)

`props: { surface: 'panel' | 'modal' | 'floating-window' }`

- `'use client'`. Starts the host in a `useEffect` (client-only). The host's
  single-instance guard makes React StrictMode's double-mount safe; the effect
  returns `teardown()` for cleanup.
- Wraps the app content in the matching wrapper class (`pd-mock-panel` /
  `pd-mock-modal` / `pd-mock-floating-window`).
- Initializes the real SDK against the host and applies that surface's **maximum**
  size via `initialize({ size })`: panel `{ height: 750 }`, floating
  `{ width: 800, height: 700 }`, modal `{ width: 99999, height: 99999 }`
  (clamps to viewport).
- Wires **every** control (same set as `index.html`): SHOW_SNACKBAR,
  SHOW_CONFIRMATION, OPEN_MODAL (deal + custom), CLOSE_MODAL, REDIRECT_TO,
  SET_NOTIFICATION, SET_FOCUS_MODE (on/off), GET_SIGNED_TOKEN, RESIZE,
  GET_METADATA, SHOW/HIDE_FLOATING_WINDOW, plus event emit buttons (VISIBILITY,
  USER_SETTINGS_CHANGE, CLOSE_CUSTOM_MODAL). Buttons appear on every page;
  surface-specific effects only show on the matching page (e.g. floating
  show/hide is a no-op + log on the panel page).
- **Log**: `useState` array, newest first. Every button press appends a line;
  every event listener (VISIBILITY, USER_SETTINGS_CHANGE, CLOSE_CUSTOM_MODAL,
  PAGE_VISIBILITY_STATE) appends its payload. Command results (confirmed, modal
  status, token, metadata) are logged too.
- Theme: a light/dark toggle that re-starts the host with `config.theme`
  (effect keyed on the theme), demonstrating the themed host UI.

## Dev-only behaviour

The host runs under `next dev` (NODE_ENV=development). In a production build
(`next build && next start`) the NODE_ENV tripwire makes it inert — correct for a
dev tool. The README/page notes "run with `npm run dev`".

## Implementation steps

1. Add the two dependencies; `npm run build` (root) then `npm install` (next-app).
2. `MockHostPlayground.tsx` — boot in `useEffect`, all controls, log state.
3. Three route pages + `custom-modal.tsx` + index nav.
4. Verify each page in the browser (MCP/playwright-cli): every control logs, the
   surface opens at its max size, custom modal loads `/custom-modal`.
```
