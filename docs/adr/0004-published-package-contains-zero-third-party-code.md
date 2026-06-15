# Published package contains zero third-party code

The published package ships only our own compiled output and has **zero runtime
dependencies**: `dependencies` is empty, the Real SDK is a `peerDependency`, and
everything else (build tooling, test libraries) is a `devDependency`. The tarball
contains only `dist/**` plus `LICENSE`/`README`/`package.json` (governed by the
`files` allowlist). No test library and no `@pipedrive/app-extensions-sdk` code
may be inlined into `dist`.

We enforce this automatically rather than trusting review, because the leak is
silent: tsup auto-externalizes `dependencies`/`peerDependencies` but **inlines
`devDependencies`** — so an accidental `import … from 'vitest'` (or any test lib)
in the entry graph would be copied into the bundle and shipped, and the IIFE
build inlines everything by design.

## Enforcement (runs in `npm run ci` and `prepublishOnly`, after build)

1. **publint** — package.json publish correctness (`files`, `exports`, types
   conditions).
2. **@arethetypeswrong/cli** — type resolution across node10 / node16 CJS+ESM /
   bundler.
3. **Custom `dist` scan** — two complementary checks:
   - _Structural allowlist_ (ESM + CJS): every bare `import`/`require` specifier
     must be a declared `peerDependency` or a Node builtin — ideally none, since
     the Mock Host keeps internal copies of the wire constants (see ADR-0003).
   - _Denylist content scan_ (all formats incl. IIFE): the bundle must not
     contain the package-name signatures of any `devDependency` / `peerDependency`
     — this catches code inlined into the IIFE, where there is no import statement
     to inspect.

## Consequences

- Adds two dev dependencies (`publint`, `@arethetypeswrong/cli`) and one check
  script.
- The structural allowlist reads `peerDependencies` from `package.json`, so it
  stays correct as that set changes; the denylist derives from the dependency
  names, so new dev/test packages are covered automatically.
- If the Mock Host ever needs the Real SDK's enum _values_ at runtime, the IIFE
  denylist would flag it — reinforcing the ADR-0003 decision to use internal
  constants instead.
