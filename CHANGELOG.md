# pipedrive-app-extensions-mock-host

## 0.1.0

### Minor Changes

- Initial release of the development-only mock host for the Pipedrive App Extensions SDK.

  It plays the missing Pipedrive parent window on `localhost`, so an App Extension can run against the real `@pipedrive/app-extensions-sdk` with no iframe — listening for the SDK's messages over the same wire protocol and rendering real UI into an open Shadow DOM.

  - **Commands**: `INITIALIZE`, `SHOW_SNACKBAR`, `SHOW_CONFIRMATION`, `OPEN_MODAL` (entity + custom), `CLOSE_MODAL`, `REDIRECT_TO`, `SET_NOTIFICATION`, `SET_FOCUS_MODE`, `SHOW`/`HIDE_FLOATING_WINDOW`, `RESIZE`, `GET_METADATA`, `GET_SIGNED_TOKEN` — with reply shapes matching the SDK's own types, and host-driven events (`VISIBILITY`, `USER_SETTINGS_CHANGE`, `PAGE_VISIBILITY_STATE`, `CLOSE_CUSTOM_MODAL`).
  - **Surfaces**: Custom Panel, Custom Modal, and Floating Window wrappers via an injected class or id.
  - **Dev Tool**: an interactive, surface-aware control overlay with an Active Log, configurable corner and collapse state.
  - **Controller API**: `emit`, `getCalls`, `devTool.setPosition`, `teardown`, plus headless overrides (`onConfirmation`, `onModal`, `getSignedToken`, `customModals`) and theming.
  - Framework-agnostic, ESM/CJS/IIFE builds, zero runtime dependencies, `sideEffects: false`, and layered defences to keep it out of production.
