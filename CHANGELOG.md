# pipedrive-app-extensions-mock-host

## 0.4.1

### Patch Changes

- update docs

## 0.4.0

### Minor Changes

- `GET_METADATA` now reports the hosting window (dev browser viewport), not the surface's own size — matching real Pipedrive's `windowWidth`/`windowHeight` semantics.

## 0.3.1

### Patch Changes

- Dock the Custom Modal surface to the top of the viewport (like Pipedrive) instead of vertically centring it.

## 0.3.0

### Minor Changes

- Fix the Dev Tool "Page" control (and `emit(PAGE_VISIBILITY_STATE)`), which was a no-op: the host now dispatches a real document `visibilitychange` so the app's `PAGE_VISIBILITY_STATE` listener fires.

## 0.2.2

### Patch Changes

- The Dev Tool now collapses/expands when you click anywhere on its header bar, not just the small +/− button

## 0.2.1

### Patch Changes

- update docs

## 0.2.0

### Minor Changes

- Add an opt-in `.pd-mock-scroll-layer` wrapper that turns a surface into a non-scrolling frame so `position: fixed` footers pin to the surface

## 0.1.0

### Minor Changes

- Initial release of the development-only mock host for the Pipedrive App Extensions SDK.

  It plays the missing Pipedrive parent window on `localhost`, so an App Extension can run against the real `@pipedrive/app-extensions-sdk` with no iframe — listening for the SDK's messages over the same wire protocol and rendering real UI into an open Shadow DOM.

  - **Commands**: `INITIALIZE`, `SHOW_SNACKBAR`, `SHOW_CONFIRMATION`, `OPEN_MODAL` (entity + custom), `CLOSE_MODAL`, `REDIRECT_TO`, `SET_NOTIFICATION`, `SET_FOCUS_MODE`, `SHOW`/`HIDE_FLOATING_WINDOW`, `RESIZE`, `GET_METADATA`, `GET_SIGNED_TOKEN` — with reply shapes matching the SDK's own types, and host-driven events (`VISIBILITY`, `USER_SETTINGS_CHANGE`, `PAGE_VISIBILITY_STATE`, `CLOSE_CUSTOM_MODAL`).
  - **Surfaces**: Custom Panel, Custom Modal, and Floating Window wrappers via an injected class or id.
  - **Dev Tool**: an interactive, surface-aware control overlay with an Active Log, configurable corner and collapse state.
  - **Controller API**: `emit`, `getCalls`, `devTool.setPosition`, `teardown`, plus headless overrides (`onConfirmation`, `onModal`, `getSignedToken`, `customModals`) and theming.
  - Framework-agnostic, ESM/CJS/IIFE builds, zero runtime dependencies, `sideEffects: false`, and layered defences to keep it out of production.
