# Dev Tool mounting and scope

The host ships an interactive **Dev Tool**: a control overlay the developer uses
to drive the host (push Events to the App Extension, resize the surface, toggle
focus mode) and observe what crosses the host boundary (the Active Log). On by
default. This ADR records two decisions a future reader will find surprising,
because both deliberately depart from how the rest of the host works.

## It renders itself into the shadow root — no consumer element

Surfaces (ADR-0005, ADR-0006) are opted into with a consumer-provided element
(`<div class="pd-mock-panel">` or `id="pd-mock-panel"`). The Dev Tool does the
**opposite**: like the snackbar and the chrome layer, it appends itself to the
host's own shadow root and needs **zero** consumer markup. `startPipedriveMockHost()`
alone makes it appear.

The reason Surfaces need a consumer element does not apply here. A Surface
**wraps the consumer's own content**, so it must live in the light DOM where that
content is. The Dev Tool wraps **nothing of the consumer's** — it is pure host
UI. Giving it to a consumer `<div id="pd-mock-dev-tool">` would reintroduce the
exact fragility the host otherwise avoids: a framework (React/Vue/Svelte) owns
its DOM subtree and may remove or re-render a foreign node inside it. Rendering
into the shadow root with `position: fixed` sidesteps that entirely and is **zero
effort on every framework, including vanilla JS** — which is the whole point.

Placement is configurable (`devTool.position`, default `bottom-left` — the one
corner not already used by chrome/floating-window/snackbar), but the element is
always host-owned and shadow-rooted regardless of position.

## It drives only host-producible effects — it never fakes a Command

A Command travels **app → host**: the App Extension calls `sdk.execute(...)` and
the host replies. The host holds **no reference to the consumer's `sdk`** — it
only sees the listener ports the app registered and the commands that arrive. So
the Dev Tool **cannot** make the app fire a command. The `testing/` playground's
command buttons work only because the playground _is_ the app and holds the
`sdk`; the host-rendered Dev Tool is not.

Therefore the Dev Tool exposes only controls whose effect the **host can produce
on its own**, in two flavours:

- **Emit an Event** (host → app): `USER_SETTINGS_CHANGE` (theme), `VISIBILITY`,
  `PAGE_VISIBILITY_STATE`. The host owns this channel.
- **Manipulate host-owned Surface state** directly: **Resize** (the host owns the
  surface element, so it sets its dimensions, reusing the real `RESIZE` bounds
  validation) and the **Focus mode** toggle (the host owns disabling the floating
  window's close button).

It deliberately has **no** "Show snackbar" / "Open modal" / "Set notification"
buttons. Those are host UI the app triggers by sending a command; synthesising
them from the Dev Tool would fake an inbound command that never happened,
breaking fidelity and polluting the Active Log with events that did not occur.
Such commands appear in the Dev Tool **only as Active Log entries** when the app
actually sends them.

## Consequences

- The Dev Tool is surface-type aware: a `MutationObserver` tracks when a Surface
  wrapper is added or removed, so the Focus mode control is shown only while a
  Floating Window is active and Resize is clamped to the active surface's bounds
  (or disabled, "no surface detected", when the host has fallen back to
  `document.body`). The observer is disconnected on `teardown()`.
- The Active Log records more than `getCalls()` does today: outbound Events and
  dev diagnostics are not currently captured anywhere, and the log adds them
  alongside Commands and Tracks, each tagged with direction and a timestamp.
  `getCalls()` keeps its existing contract independent of the log's visibility.
- The Dev Tool inherits every safety gate of the host with no special-casing:
  production (`NODE_ENV=production`), SSR (no `window`), and `enabled: false` all
  leave the host inert, so the Dev Tool cannot leak into production any more than
  the host itself can.
- If a future SDK version exposed a way for the host to invoke app commands, the
  "never fakes a Command" constraint should be revisited.
