# pipedrive-app-extensions-sdk-mock

A framework-agnostic mock of the [Pipedrive App Extensions SDK](https://github.com/pipedrive/app-extensions-sdk)
(`@pipedrive/app-extensions-sdk`).

The real SDK posts messages to the Pipedrive host window, so your app
extension only does anything visible when it runs embedded inside Pipedrive.
This mock **acts as the host itself** and renders real UI elements (snackbars,
confirmation dialogs, modals, …) directly into the page — so you can develop
and test an app extension locally, in any framework or in plain vanilla JS.

> **Status:** early scaffolding. The public API surface is being built out
> incrementally to mirror `@pipedrive/app-extensions-sdk` v0.16.0.

## Install

```bash
npm install --save-dev pipedrive-app-extensions-sdk-mock
```

## Usage

The mock mirrors the real SDK's import shape, so it can be swapped in during
local development:

```ts
import AppExtensionsSDK, { Command } from 'pipedrive-app-extensions-sdk-mock';

const sdk = await new AppExtensionsSDK({ identifier: 'dev' }).initialize();

await sdk.execute(Command.SHOW_SNACKBAR, { message: 'Hello from the mock!' });
```

(The example above reflects the target API; see the status note above for what
is implemented today.)

## Development

```bash
npm install      # install dependencies
npm run dev      # run tests in watch mode (vitest)
npm test         # run tests once
npm run build    # type-check and emit dist/ with declarations
npm run ci       # build + check formatting + test (what CI runs)
```

### Releasing

This package uses [Changesets](https://github.com/changesets/changesets).

```bash
npx changeset        # describe your change
npm run local-release # version + publish to npm
```

## License

[MIT](./LICENSE) © Antti Lahtinen
