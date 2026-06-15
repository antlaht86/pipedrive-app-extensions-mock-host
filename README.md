# pipedrive-app-extensions-mock-host

A development-only **mock host** for the
[Pipedrive App Extensions SDK](https://github.com/pipedrive/app-extensions-sdk)
(`@pipedrive/app-extensions-sdk`).

In production your app extension runs inside a Pipedrive iframe, and the SDK
posts messages to the Pipedrive window (`window.parent`). On `localhost` there is
no Pipedrive on the other end, so the SDK has nobody to talk to. This package
**plays that missing window**: it listens for the SDK's messages and answers
them, rendering real UI elements (snackbars, confirmations, modals, …) into your
page. It is framework-agnostic — works with any framework or plain vanilla JS.

It does **not** replace the SDK. You keep using the real
`@pipedrive/app-extensions-sdk`; this is the host it connects to. See
[`docs/adr/0001`](./docs/adr/0001-mock-host-not-sdk-replacement.md).

> **Status:** infrastructure and design complete; the host implementation is
> being built next. See [`docs/plans`](./docs/plans/) and
> [`CONTEXT.md`](./CONTEXT.md).

## Requirements

- The real `@pipedrive/app-extensions-sdk` installed (it is a `peerDependency`).
- Your app must **not** run inside an iframe in dev, so that
  `window.parent === window` and the Mock Host can listen on the same window.

## Install

```bash
npm install --save-dev pipedrive-app-extensions-mock-host
```

## Usage (target API)

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

The host returns a controller: `{ teardown(), emit(event, data), getCalls() }`.
`emit` pushes host-driven events (e.g. `USER_SETTINGS_CHANGE`, `VISIBILITY`) to
the SDK; `getCalls` lists the commands the app sent (useful in tests).

In a plain HTML page, load the SDK's UMD build and this package's IIFE build
(`window.PipedriveMockHost`) side by side — no bundler required.

## Keeping it out of production

This is a **development-only** tool. Layered defence (see
[`docs/adr/0007`](./docs/adr/0007-keeping-the-mock-host-out-of-production.md))
keeps it out of your production build:

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
