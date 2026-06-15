# Mock Host — design, part 1: full feature inventory + mock approach

Date: 2026-06-15. Status: design agreed via grilling session.
Package: `pipedrive-app-extensions-mock-host`.
Source of truth for the SDK: `node_modules/@pipedrive/app-extensions-sdk`
`dist/index.js` + `dist/types.d.ts` (v0.16.0).

See `CONTEXT.md` for terminology (Mock Host, Real SDK, App Extension, Command,
Event, Track, Surface) and `docs/adr/0001..0003` for the locked architectural
decisions.

## Locked decisions (from grilling)

1. **Mock Host, not SDK replacement** (ADR-0001). Real SDK is a `peerDependency`;
   works because `window.parent === window` outside an iframe.
2. **Public API = controller handle**: `startPipedriveMockHost(config?) =>
   { teardown(), emit(event, data), getCalls() }`. Programmatic; no dev panel yet.
3. **`GET_SIGNED_TOKEN`** = `config.getSignedToken?: () => string | Promise<string>`,
   default returns `'dev-signed-token'`. JWT-minting stays out of the package.
4. **Interactive UI by default + config override** for response-producing
   commands: render real dialog/modal and wait for a click; `config.onConfirmation`
   / `config.onModal` resolve headlessly when set.
5. **Open Shadow DOM** for all UI (ADR-0002); theming via CSS custom properties;
   tests query `within(host.shadowRoot)`.
6. **Surface** = consumer-designated wrapper (`config.surface`: element or
   selector); `RESIZE` sizes it, `GET_METADATA` measures it; fallback
   `document.body`.
7. **`CUSTOM_MODAL` content** = `config.customModals?: Record<actionId, url> |
   ((attrs) => string | undefined)`; resolve URL → render iframe; fallback
   `data.url`; else placeholder.
8. **Build with tsup → ESM + CJS + IIFE** (ADR-0003).
9. **Visual style**: neutral, Pipedrive-flavoured, with a visible "MOCK" marker.
10. **SSR-safe**: no-op handle when `typeof window === 'undefined'`.
11. **Minor commands** render an observable effect AND are recorded in `getCalls()`.
12. **Theme**: `config.theme?: 'dark' | 'light'`, default `'light'`; runtime
    change via `emit(USER_SETTINGS_CHANGE, { theme })` (also updates
    `sdk.userSettings`).

## Wire protocol the host implements

Messages arrive on `window` as `{ payload, id }` where
`payload = { command?|event?, args?, type }`, `type ∈ command|listener|track`.

- **command**: reply once on `event.ports[0]` with `{ data }` or `{ error }`.
- **listener**: keep `event.ports[0]`; push `{ data }` over time (one port per
  active listener, keyed by event).
- **track**: no port, no reply; record only.

## Feature inventory + mock behaviour (nothing omitted)

### Lifecycle / construction (host's responsibilities)

| SDK feature | Mock Host behaviour |
| --- | --- |
| `new AppExtensionsSDK({ identifier })` | Host not involved; consumer passes `{ identifier: 'dev-local' }`. |
| `targetWindow` default `window.parent` | Host listens on `window` (=== parent on localhost). |
| `.initialize({ size? })` (awaits reply) | **Must** reply to `INITIALIZE` or init hangs forever. Applies initial `size` to the Surface. |
| `.execute / .listen / .track / .setWindow` | Handled per message `type` above. |
| `.userSettings.theme` | Reflected by host theme; `USER_SETTINGS_CHANGE` updates it. |

### Commands — all 13

| Command | args → response | Mock Host |
| --- | --- | --- |
| `INITIALIZE` | `{size?}` → void | Reply immediately (handshake); apply size to Surface. |
| `SHOW_SNACKBAR` | `{message, link?}` → void | Render snackbar (message + optional link), auto-dismiss. |
| `SHOW_CONFIRMATION` | `{title, description?, okText?, cancelText?, okColor?}` → `{confirmed}` | Render dialog, resolve on click; `config.onConfirmation` overrides. |
| `RESIZE` | `{width?, height?}` → void | Set `surface.style.width/height`. |
| `OPEN_MODAL` | `ModalAttributes` → `{status, id?}` | Render modal (6 types below); resolve on close/submit; `config.onModal` overrides. |
| `CLOSE_MODAL` | void → void | Close the open modal. |
| `GET_SIGNED_TOKEN` | void → `{token}` | `config.getSignedToken?.() ?? 'dev-signed-token'`. |
| `REDIRECT_TO` | `{view, id?, context?}` → void | Transient banner "would redirect to {view}"; record. |
| `SHOW_FLOATING_WINDOW` | `{context?}` → void | Show floating box; record. |
| `HIDE_FLOATING_WINDOW` | `{context?}` → void | Hide floating box; record. |
| `SET_NOTIFICATION` | `{number?}` → void | Show badge count; record. |
| `SET_FOCUS_MODE` | `boolean` → void | Toggle focus-mode overlay/class; record. |
| `GET_METADATA` | void → `{windowHeight, windowWidth}` | Measure the Surface. |

**`OPEN_MODAL` — all 6 modal types.** `DEAL` (`prefill:{title,person,organization}`),
`PERSON` (`{name,organization}`), `ORGANIZATION` (`{name}`), `ACTIVITY`
(`{subject,dueDate,dueTime,duration,note,description,deal,organization}`),
`JSON_MODAL` (`action_id`), `CUSTOM_MODAL` (`action_id, data?`). Native-entity
and JSON modals → placeholder modal showing the prefill, with Submit/Close
(Submit → `{status: SUBMITTED, id: <fake>}`, Close → `{status: CLOSED}`).
Custom modal → iframe to the resolved URL (decision 7); on close fire
`CLOSE_CUSTOM_MODAL` and resolve `{status: CLOSED}`.

### Events — all 4 (host pushes to the App Extension via `emit`)

| Event | data | Trigger in dev |
| --- | --- | --- |
| `VISIBILITY` | `{is_visible, context?:{invoker: USER\|COMMAND}}` | `host.emit(...)` only (no natural localhost trigger). |
| `CLOSE_CUSTOM_MODAL` | void | Fired automatically when a custom modal closes; also via `emit`. |
| `PAGE_VISIBILITY_STATE` | `{state: visible\|hidden}` | **Not host-driven** — Real SDK listens to `document.visibilitychange` itself. Triggered by actually hiding the tab. |
| `USER_SETTINGS_CHANGE` | `{theme}` | `host.emit(...)`; updates `sdk.userSettings`. |

### Track — all 1

| Event | Mock Host |
| --- | --- |
| `FOCUSED` | Real SDK emits on window focus; host receives, does not reply, records in `getCalls()`. |

### Enums to mirror / re-export

`Command`, `Event`, `MessageType`, `Color`, `Modal`, `ModalStatus`,
`TrackingEvent`, `VisibilityEventInvoker`, `View`, `UserSettingsTheme` (note:
the last is a type-only export in the Real SDK, not a runtime named export).

## Config shape (consolidated)

```ts
interface MockHostConfig {
  surface?: HTMLElement | string; // default: document.body
  theme?: 'dark' | 'light'; // default: 'light'
  getSignedToken?: () => string | Promise<string>; // default: 'dev-signed-token'
  onConfirmation?: (args) => boolean | Promise<boolean>; // default: interactive UI
  onModal?: (attrs) => { status; id? } | Promise<...>; // default: interactive UI
  customModals?: Record<string, string> | ((attrs) => string | undefined);
  // (minor-command callbacks like onRedirect deferred — YAGNI)
}
```

## Testing strategy (aligns with existing scaffold)

- **Host logic** — jsdom unit project. jsdom does NOT transfer `MessagePort`s via
  `postMessage`, so tests **simulate** the protocol: dispatch
  `new MessageEvent('message', { data, ports: [channel.port2] })` and assert the
  host's reply on the port + the rendered UI in `host.shadowRoot`.
- **Real SDK ↔ Mock Host** — browser project (Chromium). Port transfer works in a
  real browser, so end-to-end against the unmodified Real SDK runs here.

## Follow-up: scaffold changes implied by these decisions

The current scaffold assumed an SDK *replacement*; align it:

- `package.json`: rename to `pipedrive-app-extensions-mock-host`; move
  `@pipedrive/app-extensions-sdk` to `peerDependencies` (`>=0.16.0`) and keep a
  dev copy; add `tsup` + dual/IIFE `exports`; swap `build` script `tsc` → `tsup`.
- Rewrite `README.md` around the Mock Host usage (real SDK + `startPipedriveMockHost`).
- Resolve the wire-constants question (ADR-0003 consequence): internal constants
  asserted equal to the Real SDK enums, vs importing — to keep the IIFE build clean.
```
