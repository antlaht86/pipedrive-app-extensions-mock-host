# Keeping the Mock Host out of production

The Mock Host must never run in a consumer's production build. A library cannot
fully prevent a determined consumer from shipping it, so the goal is to make the
right path easy (the code is gone from prod bundles) and the wrong path loud (a
warning) — defence in depth across four layers:

1. **Design — tree-shakeable, zero runtime deps.** `dependencies` is empty (the
   Real SDK is a `peerDependency`) and `sideEffects: false`. A call gated behind
   a statically-known dev flag **at the call site** is dead code in production,
   so even a static import is eliminated from the prod bundle (measured: removed
   by both Vite/Rollup and Next.js/Turbopack). This is **fragile**: the gate must
   be statically provable — moving it behind a helper function in another module,
   or calling unconditionally with `enabled`, keeps the package in the bundle (a
   real consumer shipped ~65 KB gzip that way). The **robust** path the docs lead
   with is a dynamic `import()` behind the gate: if the gate is ever not
   eliminated, the package lands in an on-demand chunk prod never fetches, rather
   than being inlined into route bundles.
2. **Docs — the obvious path.** Install as a `devDependency` and gate the call
   behind a build-time dev flag (`import.meta.env.DEV`, `process.env.NODE_ENV`,
   …), e.g. `startPipedriveMockHost({ enabled: import.meta.env.DEV })`.
3. **Runtime tripwire.** `startPipedriveMockHost` `console.warn`s and returns an
   inert handle (injects nothing, registers no listener) when
   `process.env.NODE_ENV === 'production'`. Guarded by `typeof process` and read
   via bracket access so it is not statically inlined (and stays testable). In a
   pure-browser / IIFE context with no `process`, it defaults to enabled — it is
   a dev tool.
4. **Explicit off-switch.** `config.enabled` (default `true`); `enabled: false`
   returns the inert handle with no warning, so the caller can disable the host
   from outside without removing the call.

## Considered alternatives

- **Runtime-only guard** (no tree-shaking): the code still ships in the bundle,
  and "is this production?" detection is unreliable across frameworks.
- **Docs only**: no safety net if a consumer forgets to gate the call.
- **Iframe detection** (`window.parent !== window`): would also fire in
  iframed dev pages and in the Vitest browser test harness.

## Consequences

- The strong guarantee (code absent from the prod bundle) depends on the
  consumer gating the call; we enable and document it but cannot enforce it.
- `NODE_ENV` is the de-facto standard prod signal; a consumer who never sets it
  gets dev behaviour, which is the safe default for a dev tool.
