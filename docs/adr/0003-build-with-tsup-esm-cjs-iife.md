# Build with tsup to ESM + CJS + IIFE

The package is built with **tsup** and ships three formats: ESM (for
bundlers — Vite, Next, webpack), CJS (for Node/`require`), and IIFE (for plain
`<script>`-tag use with no build step). The `exports` map points each condition
at the right file.

The stated goal is "usable from any framework or vanilla JS." Bundler users need
ESM, Node-based tooling needs CJS, and a vanilla developer dropping a `<script>`
into an HTML page needs a global IIFE build. The real SDK already ships
`index.umd.js`, so the vanilla path composes: load the SDK's UMD and our IIFE
side by side. tsup produces all three from one config; plain `tsc` could not.

This supersedes the initial `tsc`, ESM-only scaffold.

## Consequences

- The IIFE build cannot resolve the `@pipedrive/app-extensions-sdk`
  peerDependency at runtime. The Mock Host therefore must not depend on
  importing the SDK's enum _values_ at runtime in a way that breaks IIFE —
  either externalize the SDK as a global or keep internal copies of the wire
  constants (asserted equal to the SDK's enums by a test).
- More build surface than `tsc`: a `tsup.config.ts` and three output bundles to
  keep working in CI.
