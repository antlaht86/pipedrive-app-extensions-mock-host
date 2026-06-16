# pipedrive-app-extensions-mock-host

A development-only **mock host** for the
[Pipedrive App Extensions SDK](https://github.com/pipedrive/app-extensions-sdk)
(`@pipedrive/app-extensions-sdk`).

In production your app extension runs inside a Pipedrive iframe, and the SDK
posts messages to the Pipedrive window (`window.parent`). On `localhost` there is
no Pipedrive on the other end, so the SDK has nobody to talk to. This package
**plays that missing window**: it listens for the SDK's messages and answers
them, rendering real UI elements (snackbars, confirmations, modals, surface
header bars, …) into your page. It is framework-agnostic — works with React,
Vue, Next.js, or plain vanilla JS.

It does **not** replace the SDK. You keep using the real
`@pipedrive/app-extensions-sdk`; this is the host it connects to.

[image: a screenshot of a localhost dev page showing an App Extension panel with
the host-injected header bar and a snackbar at the bottom-right corner — the
"this is what the mock host renders" hero shot. Alt: "App Extension running on
localhost with the mock host rendering a surface header and a snackbar."]

## How it works

The real SDK and the mock host talk over the exact same wire protocol the SDK
uses in production:

1. **Handshake.** When your code calls `new AppExtensionsSDK(...).initialize()`,
   the SDK posts an `initialize` message to `window.parent`. Because you are not
   in an iframe in dev, `window.parent === window`, so the mock host — listening
   on that same window — receives it and replies, completing the handshake.
2. **Commands.** Each `sdk.execute(Command.X, args)` opens a
   [`MessageChannel`](https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel):
   one request, one reply. The host parses the command, renders the matching UI
   (or runs your headless override), and replies on the same port — which
   resolves the SDK's promise. Reply shapes match the SDK's own types exactly.
3. **Events.** The host can push messages _to_ your App Extension over time
   (e.g. `VISIBILITY`, `USER_SETTINGS_CHANGE`) via the controller's `emit()`.
   Your `sdk.listen(Event.X, cb)` receives them. The host also fires some events
   on its own from user interaction: closing a custom modal (its X button or
   `CLOSE_MODAL`) fires `CLOSE_CUSTOM_MODAL`, and closing a floating window via
   its X fires `VISIBILITY` with `context.invoker = 'user'`.
4. **Tracks.** Fire-and-forget messages the SDK sends (e.g. `FOCUSED`) are
   received and swallowed — no reply, by design.

All host-rendered UI lives inside a single open **Shadow DOM** root, so the
host's styles never leak into your app and your app's styles never reach the
host UI. The published package contains **zero** third-party code and has no
runtime dependencies.

[image: an architecture diagram showing the App Extension code → Real SDK →
postMessage / MessageChannel → Mock Host → Shadow DOM UI, with an arrow back for
events. Use it in the "How it works" section. Alt: "Data flow between the App
Extension, the Real SDK, and the Mock Host over a MessageChannel."]

## Requirements

- The real `@pipedrive/app-extensions-sdk` installed (it is a `peerDependency`,
  `>=0.16.0`).
- Node `>=20` for development of this package.
- Your app must **not** run inside an iframe in dev, so that
  `window.parent === window` and the mock host can listen on the same window.

## Install

```bash
npm install --save-dev pipedrive-app-extensions-mock-host
```

## Quick start

```ts
import { startPipedriveMockHost } from 'pipedrive-app-extensions-mock-host';
import AppExtensionsSDK, { Command } from '@pipedrive/app-extensions-sdk';

// Detect dev however you like (Vite: import.meta.env.DEV, Node:
// process.env.NODE_ENV, or a hostname check for vanilla JS).
const isDev = location.hostname === 'localhost';

// Start the host only in development.
const host = isDev ? startPipedriveMockHost() : undefined;

// The real SDK, pointed at the mock host (no iframe → identifier must be given).
const sdk = await new AppExtensionsSDK(
  isDev ? { identifier: 'dev-local' } : undefined,
).initialize();

await sdk.execute(Command.SHOW_SNACKBAR, {
  message: 'Hello from the mock host!',
});

// Later, when tearing down dev tooling:
host?.teardown();
```

In a plain HTML page, load the SDK's UMD build and this package's IIFE build
(`window.PipedriveMockHost`) side by side — no bundler required. See
[`testing/index.html`](./testing/index.html) for a complete vanilla example.

## Configuration

`startPipedriveMockHost(config?)` accepts a `MockHostConfig`. Every field is
optional:

| Option           | Type                                                         | Default              | Purpose                                                                                                                       |
| ---------------- | ------------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `enabled`        | `boolean`                                                    | `true`               | Turn the host off without removing the call (e.g. `{ enabled: import.meta.env.DEV }`). When `false`, returns an inert handle. |
| `theme`          | `'light' \| 'dark'`                                          | `'light'`            | Visual theme for the host's own mock UI.                                                                                      |
| `onConfirmation` | `(args) => boolean \| Promise<boolean>`                      | —                    | Headless override for `SHOW_CONFIRMATION`; return whether the user confirmed. Omit to render an interactive dialog.           |
| `getSignedToken` | `() => string \| Promise<string>`                            | `'dev-signed-token'` | Provides the token returned by `GET_SIGNED_TOKEN`. Return a real dev JWT to exercise your backend's verify path.              |
| `onModal`        | `(attrs) => ModalResult \| Promise<ModalResult>`             | —                    | Headless override for `OPEN_MODAL`; return the modal result instead of rendering a dialog.                                    |
| `customModals`   | `Record<string, string> \| ((attrs) => string \| undefined)` | —                    | Maps a custom-modal `action_id` to the URL the modal iframe should load.                                                      |
| `appName`        | `string`                                                     | `'App Extension'`    | Name shown in the surface header bar the host injects onto each surface.                                                      |
| `appIcon`        | `string`                                                     | a generic glyph      | Icon shown in the surface header bar — a URL (rendered as an `<img>`) or a short glyph/emoji.                                 |

### Theme and header branding

```ts
const host = startPipedriveMockHost({
  theme: 'dark',
  appName: 'Acme CRM Helper',
  appIcon: '/logo.svg', // a URL → rendered as <img>; or a glyph like '🚀'
});
```

### Headless overrides (skip the UI)

Pass `onConfirmation` and `onModal` to answer those commands without rendering a
dialog — handy for automated runs and end-to-end tests:

```ts
startPipedriveMockHost({
  // Always confirm, instead of showing the confirmation dialog.
  onConfirmation: () => true,
  // Resolve OPEN_MODAL with a fixed result instead of opening a modal.
  onModal: (attrs) => ({ status: 'submitted', id: 123 }),
});
```

### Signed token and custom modals

```ts
import { SignJWT } from 'jose';

startPipedriveMockHost({
  // Return a real dev JWT to exercise your backend's verify path.
  getSignedToken: async () =>
    new SignJWT({ sub: 'dev-user' })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('dev-secret')),
  // Map a custom-modal action_id → the URL its iframe loads.
  customModals: {
    'settings-modal': '/dev/settings.html',
  },
});
```

`customModals` can also be a function, e.g. to build the URL from the modal's
arguments:

```ts
startPipedriveMockHost({
  customModals: (attrs) => `/dev/modals/${attrs.action_id}.html`,
});
```

## Controller API

`startPipedriveMockHost()` returns a `MockHost` controller:

| Member       | Signature                       | Purpose                                                                                      |
| ------------ | ------------------------------- | -------------------------------------------------------------------------------------------- |
| `shadowRoot` | `ShadowRoot`                    | The open shadow root the host renders its UI into. Query it in tests (`within(shadowRoot)`). |
| `emit`       | `(event: string, data) => void` | Push a host-driven event to the App Extension (e.g. `USER_SETTINGS_CHANGE`, `VISIBILITY`).   |
| `getCalls`   | `() => MockHostCall[]`          | The commands the App Extension has sent so far (`{ command, args }`) — useful in tests.      |
| `teardown`   | `() => void`                    | Stop listening and remove all rendered UI.                                                   |

### Pushing events to the App Extension

The App Extension listens with `sdk.listen(...)`; the host pushes events with
`emit(...)`. Use it to simulate Pipedrive-driven changes like a theme switch or
visibility change:

```ts
import AppExtensionsSDK, { Event } from '@pipedrive/app-extensions-sdk';

const host = startPipedriveMockHost();
const sdk = await new AppExtensionsSDK({
  identifier: 'dev-local',
}).initialize();

// App side: react to host-driven events.
sdk.listen(Event.USER_SETTINGS_CHANGE, ({ data }) => {
  console.log('theme is now', data.theme);
});

// Host side: simulate Pipedrive flipping the theme to dark.
host.emit(Event.USER_SETTINGS_CHANGE, { theme: 'dark' });
```

### Inspecting sent commands in tests

`getCalls()` returns every command the App Extension has sent, so you can assert
on them, then `teardown()` to clean up:

```ts
const host = startPipedriveMockHost();
const sdk = await new AppExtensionsSDK({
  identifier: 'dev-local',
}).initialize();

await sdk.execute(Command.SHOW_SNACKBAR, { message: 'Saved!' });

expect(host.getCalls()).toContainEqual({
  command: 'show_snackbar',
  args: { message: 'Saved!' },
});

host.teardown(); // stop listening and remove all rendered UI
```

## Supported commands

The host implements the App Extension command set and renders the same UI
Pipedrive would. Reply shapes match the SDK's own types.

| Command                                         | What the host does                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INITIALIZE`                                    | Completes the handshake; applies the optional initial `size` to the active surface.                                                                                             |
| `SHOW_SNACKBAR`                                 | Renders a transient snackbar (bottom-right), auto-dismissing after ~5s; supports an optional link button.                                                                       |
| `SHOW_CONFIRMATION`                             | Renders a confirmation dialog and resolves `{ confirmed }`; or uses your `onConfirmation` override.                                                                             |
| `OPEN_MODAL`                                    | Opens a **custom modal** (loads a URL via `customModals`) or an **entity modal** (a Pipedrive-style create-record form with prefilled values); or uses your `onModal` override. |
| `CLOSE_MODAL`                                   | Closes an open **custom** modal and fires `CLOSE_CUSTOM_MODAL`. (Entity modals are native forms the app cannot close.)                                                          |
| `REDIRECT_TO`                                   | Shows a redirect banner (auto-dismisses after ~4s) naming the target view/id.                                                                                                   |
| `SET_NOTIFICATION`                              | Shows a notification badge. **Floating-window only.**                                                                                                                           |
| `SET_FOCUS_MODE`                                | Toggles focus mode, disabling the floating window's close button. **Floating-window only.**                                                                                     |
| `SHOW_FLOATING_WINDOW` / `HIDE_FLOATING_WINDOW` | Shows / hides the floating-window surface. **Floating-window only.**                                                                                                            |
| `RESIZE`                                        | Resizes the active surface, clamped to that surface type's bounds (out-of-range requests are rejected).                                                                         |
| `GET_METADATA`                                  | Returns the surface's current `{ windowWidth, windowHeight }`.                                                                                                                  |
| `GET_SIGNED_TOKEN`                              | Returns `{ token }` from `getSignedToken` (default `'dev-signed-token'`).                                                                                                       |

Surface-scoped commands run on the wrong surface log a dev-only diagnostic and
still reply (so the SDK promise never hangs).

### Example calls

```ts
// A snackbar with an action link.
await sdk.execute(Command.SHOW_SNACKBAR, {
  message: 'Deal saved!',
  link: { url: '/deals/42', label: 'View' },
});

// A confirmation dialog → resolves with the user's choice.
const { confirmed } = await sdk.execute(Command.SHOW_CONFIRMATION, {
  title: 'Delete this deal?',
  description: 'This cannot be undone.',
  okText: 'Delete',
  okColor: 'negative',
});

// Open an entity modal (Pipedrive create-record form) with prefilled values.
const result = await sdk.execute(Command.OPEN_MODAL, {
  type: 'activity',
  prefill: { subject: 'Follow up', dueDate: '2026-07-01' },
});

// Open a custom modal whose iframe loads the URL mapped in `customModals`.
await sdk.execute(Command.OPEN_MODAL, {
  type: 'custom_modal',
  action_id: 'settings-modal',
});

// Resize the active surface, then read its measured size back.
await sdk.execute(Command.RESIZE, { height: 600 });
const { windowWidth, windowHeight } = await sdk.execute(Command.GET_METADATA);

// Get a signed token (whatever `getSignedToken` returns).
const { token } = await sdk.execute(Command.GET_SIGNED_TOKEN);
```

[image: a screenshot of the host-rendered snackbar and a confirmation dialog,
taken from the testing/index.html playground after clicking "Snackbar" and
"Confirmation". Alt: "A mock-host snackbar and confirmation dialog rendered over
a dev page."]

## Surfaces

A **Surface** is the element standing in for the place in Pipedrive where your
App Extension renders. `RESIZE` sizes it and `GET_METADATA` measures it. You opt
in by wrapping your app in an element with the host's class (or `id`):

| Surface         | Wrapper class / id        | Width            | Height           |
| --------------- | ------------------------- | ---------------- | ---------------- |
| Custom Panel    | `pd-mock-panel`           | fixed ~385px     | 100–750px        |
| Custom Modal    | `pd-mock-modal`           | 320px – viewport | 120px – viewport |
| Floating Window | `pd-mock-floating-window` | 200–800px        | 70–700px         |

```html
<div class="pd-mock-panel">
  <!-- your App Extension renders here -->
</div>
```

The same wrapper in React (or any framework):

```tsx
export function App() {
  return (
    <div className="pd-mock-panel">{/* your App Extension renders here */}</div>
  );
}
```

- You **don't write CSS** for surfaces — the class is enough; the host injects
  the styling and positioning.
- Using the host name as an **`id`** (`<div id="pd-mock-panel">`) gives the same
  _behaviour_ (resize bounds, metadata, floating-window commands) **without** the
  host's visual styling, so you can style the element yourself:

  ```html
  <!-- behaviour without the host's look — you style it -->
  <div
    id="pd-mock-floating-window"
    style="background: #fff; border: 1px solid #ccc;"
  >
    <!-- your App Extension renders here -->
  </div>
  ```

- The host injects a **surface header bar** as the first child of each
  class-identified surface, reproducing the title bar Pipedrive frames each
  surface with: a collapse chevron, app icon + name, refresh, and a "more (⋯)"
  button on the panel; a close (X) on modals and floating windows.

### Which element becomes the active surface

The host picks the **first** element (in DOM order) matching any surface class or
id, and treats that as the surface `RESIZE` sizes and `GET_METADATA` measures:

- **No wrapper present?** The host falls back to `document.body`. `RESIZE` and
  `GET_METADATA` still work — they just act on the body. (You won't get a
  surface header bar, since there is no wrapper to inject it into.)
- **More than one wrapper?** The first in DOM order wins; the rest are ignored.
  Render only one surface wrapper at a time.

[image: a close-up of the Custom Panel's injected header bar from
testing/index.html — collapse chevron on the left, app icon + name, refresh and
⋯ buttons on the right. Alt: "The mock host's Custom Panel header bar with
collapse, app name, refresh, and more buttons."]

[image: the Custom Modal surface (testing/modal.html) showing its header bar with
the app name and a close X button. Alt: "A mock-host Custom Modal with a header
bar and close button."]

[image: the Floating Window surface (testing/floating-window.html) anchored
top-right, with its close X disabled while focus mode is on. Alt: "A mock-host
floating window in focus mode with a disabled close button."]

## Examples

The [`testing/`](./testing/) folder contains ready-to-run examples covering every
command, event, and surface:

- **Vanilla HTML playground** — load the built bundles with no bundler:
  - [`testing/index.html`](./testing/index.html) — the **Custom Panel** surface,
    with a button for every command and event.
  - [`testing/modal.html`](./testing/modal.html) — the **Custom Modal** surface.
  - [`testing/floating-window.html`](./testing/floating-window.html) — the
    **Floating Window** surface (try focus mode).
  - [`testing/custom-modal.html`](./testing/custom-modal.html) — the page loaded
    inside a custom modal's iframe.

  Run them from the repo root:

  ```bash
  npm run build
  npx http-server . -p 8080   # or: python3 -m http.server 8080
  # open http://localhost:8080/testing/  (add ?theme=dark for the dark UI)
  ```

- **Next.js playground** — [`testing/next-app/`](./testing/next-app/) is a small
  Next.js app (pages router) wiring the host into a real framework, with a
  separate page per surface (`/`, `/modal`, `/floating-window`, `/panel`) and a
  shared
  [`MockHostPlayground`](./testing/next-app/src/components/MockHostPlayground.tsx)
  component. Run it with `npm install && npm run dev` inside that folder.

## Lifecycle and edge cases

A few behaviours worth knowing when wiring the host into a dev setup:

- **One host at a time.** Calling `startPipedriveMockHost()` again before
  `teardown()` does **not** start a second host — it logs a warning and returns
  the **existing** instance. (This keeps a single listener on `window`; two would
  double-process every command.) Under hot-module-reload / fast refresh, call
  `teardown()` first if you need a fresh instance:

  ```ts
  let host = startPipedriveMockHost();

  // e.g. on an HMR dispose hook:
  import.meta.hot?.dispose(() => host.teardown());
  ```

- **Server-side rendering is safe.** With no `window` (e.g. a Next.js server
  render), `startPipedriveMockHost()` returns an inert handle and does nothing —
  so a top-level call won't crash SSR. The host only comes alive in the browser.

## Keeping it out of production

This is a **development-only** tool. Layered defence keeps it out of your
production build:

1. **Install it as a `devDependency`** (`npm install --save-dev …`).
2. **Gate the call behind a build-time dev flag.** The package is
   `sideEffects: false` with no runtime dependencies, so a dead-branch call is
   tree-shaken out of your production bundle entirely:

   ```ts
   if (import.meta.env.DEV) startPipedriveMockHost();
   // or pass the flag and let the host disable itself:
   startPipedriveMockHost({ enabled: import.meta.env.DEV });
   ```

3. **Safety net.** If it is ever started with `NODE_ENV=production`, it stays
   inert and logs a warning instead of running. `{ enabled: false }` also
   returns an inert handle (no warning) for an explicit off-switch.

## Development

```bash
npm install          # install dependencies
npm run dev          # run tests in watch mode (vitest)
npm test             # run all tests once (unit + browser)
npm run test:unit    # fast logic/DOM tests only (jsdom)
npm run test:browser # UI tests in real Chromium (Vitest Browser Mode)
npm run build        # bundle ESM + CJS + IIFE with tsup, emit declarations
npm run ci           # build + typecheck + check formatting + test (what CI runs)
```

### Testing strategy

Two Vitest projects (see [`vitest.config.ts`](./vitest.config.ts)):

- **`unit`** — fast tests in **jsdom** for host logic and DOM structure
  (`src/**/*.test.ts`). jsdom does not transfer `MessagePort`s through
  `postMessage`, so these tests simulate the wire protocol directly.
- **`browser`** — UI and real-SDK integration tests in **Chromium** via
  [Vitest Browser Mode](https://vitest.dev/guide/browser/) + Playwright
  (`src/**/*.browser.test.ts`), where port transfer works. UI is queried via the
  open Shadow DOM root (`within(host.shadowRoot)`).

Both use [Testing Library](https://testing-library.com) and
`@testing-library/jest-dom`.

### Releasing

[Changesets](https://github.com/changesets/changesets):

```bash
npx changeset         # describe your change
npm run local-release # version + publish to npm
```

## License

[MIT](./LICENSE) © Antti Lahtinen
