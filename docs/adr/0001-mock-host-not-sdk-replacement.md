# Mock the host, keep the real SDK

The package is a **Mock Host** that the unchanged `@pipedrive/app-extensions-sdk`
(the Real SDK) talks to over `window.postMessage`, not a drop-in replacement for
the SDK. The Real SDK is a `peerDependency`. This works because outside an
iframe `window.parent === window`, so the Mock Host can listen on the same
window the SDK posts to.

We chose this over reimplementing the SDK's `AppExtensionsSDK` class because it
exercises the consumer's real integration path (the actual SDK code runs), avoids
maintaining a parallel class that drifts from upstream, and keeps the Mock Host
framework-agnostic (pure DOM, no SDK internals).

## Consequences

- The consumer must install the Real SDK, and the app must **not** run inside an
  iframe in dev (otherwise `window.parent` is the real parent, not the host).
- The Mock Host depends on the SDK's wire protocol (`MessageType`, message
  shape), which is internal-ish; a protocol change upstream could break it. The
  `peerDependency` range pins compatibility.
