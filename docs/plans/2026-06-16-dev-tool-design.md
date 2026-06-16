# Dev Tool design

Date: 2026-06-16

An interactive **Dev Tool** the Mock Host renders so a developer can drive the
host and watch what crosses the host boundary, without writing any sample wiring
of their own. Grounded in the decisions captured in
[ADR-0009](../adr/0009-dev-tool-mounting-and-scope.md); see [CONTEXT.md](../../CONTEXT.md)
for the terms **Dev Tool** and **Active Log**.

## Goals

- Works with every framework and with plain vanilla JS, with **zero consumer
  markup** — `startPipedriveMockHost()` is enough.
- Exposes only what the host can genuinely do on its own (emit Events; change
  host-owned Surface state). Never fakes an app-sent Command.
- Surface-type aware: only applicable controls are shown for the active Surface.
- Carries an Active Log, on by default, that can be shown/hidden.
- Position configurable via a prop.

## Configuration

```ts
interface MockHostConfig {
  // …existing fields…
  devTool?:
    | boolean
    | {
        /** Corner the Dev Tool anchors to. Default 'bottom-left'. */
        position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
        /** Start collapsed to a launcher button. Default false (open). */
        startCollapsed?: boolean;
        /** Show the Active Log. Default true. */
        log?: boolean;
      };
}
```

- Omitted or `true` → on, with defaults (`bottom-left`, open, log on).
- `false` → not rendered at all.
- Object → per-field overrides; missing fields take the defaults above.
- All four corners are allowed even though some collide with existing chrome
  (snackbar bottom-right, floating window top-right, chrome top-left); the
  default `bottom-left` is the one free corner. A collision is the developer's
  explicit choice.

The Dev Tool only ever exists when the host is actually running, so it inherits
the host's gates with no extra code: production (`NODE_ENV=production`), SSR
(no `window`), and `enabled: false` all return an inert handle before any UI is
built.

## Mounting

Rendered into the existing host **shadow root** (`shadowRoot.appendChild(...)`),
exactly like `ensureSnackbarLayer()` / `ensureChrome()`. No consumer element, no
light-DOM node. A dedicated `ensureDevTool()` builder, idempotent, created during
`startPipedriveMockHost()` after the shadow root and surface styles are set up.

## Controls

| Control                            | Mechanism                                     | Notes                                                                                                                                              |
| ---------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resize** (width + height inputs) | Host sets the active Surface's dimensions     | Reuses the real `RESIZE` bounds validation (`SURFACE_BOUNDS`); out-of-range rejected with the same diagnostic. Disabled when no Surface is active. |
| **Emit `USER_SETTINGS_CHANGE`**    | `emitEvent`                                   | Theme selector `light` / `dark` → `{ theme }`.                                                                                                     |
| **Emit `VISIBILITY`**              | `emitEvent`                                   | `{ is_visible, context: { invoker } }`; `invoker` selector `user` / `command`.                                                                     |
| **Emit `PAGE_VISIBILITY_STATE`**   | `emitEvent`                                   | `{ state }` selector `visible` / `hidden`.                                                                                                         |
| **Focus mode** toggle              | Host disables the floating window's close (X) | Shown only when the active Surface is a Floating Window.                                                                                           |

Event payloads match the installed SDK types exactly (`EventResponse` in
`dist/types.d.ts`): `USER_SETTINGS_CHANGE` carries only `theme`, so there is no
separate theme switch — the event emitter _is_ the theme control.

The Dev Tool has no Command-firing buttons (`SHOW_SNACKBAR`, `OPEN_MODAL`,
`SET_NOTIFICATION`, …). Those are app-driven and appear only in the Active Log.

## Surface-type awareness

`resolveSurface()` is computed on demand and is not reactive, and frameworks
mount/unmount the Surface wrapper dynamically. The Dev Tool therefore keeps a
`MutationObserver` on `document.body` (`childList` + `subtree`, plus
`attributes` filtered to `['class', 'id']`) that recomputes the active surface
type (via `surfaceTypeOf`) and updates the controls. The attribute filter matters
because a framework may toggle the `pd-mock-panel` class on an **existing**
element rather than adding/removing the node — a `childList`-only observer would
miss that. The resulting control state:

- **Floating Window active** → Focus mode toggle visible; Resize bounds = FW.
- **Panel / Modal active** → Focus mode hidden; Resize bounds = that type's.
- **No Surface** (host fell back to `document.body`) → Resize disabled with
  "no surface detected"; Focus mode hidden.

A small header line shows the current active surface type so the developer knows
what the controls apply to.

The observer watches the whole `document.body` subtree, so it fires on every DOM
mutation, but each recompute is one cheap `querySelector(SURFACE_SELECTOR)` and
an idempotent control update — acceptable for a dev-only tool. (To debounce
later if needed.)

## Active Log

A running, bounded record of what crosses the host boundary. Entry types, each
tagged with a direction and timestamp and an expandable JSON payload:

| Type       | Direction  | Content                                                              |
| ---------- | ---------- | -------------------------------------------------------------------- |
| Command    | app → host | name, args, the reply value                                          |
| Track      | app → host | name (fire-and-forget)                                               |
| Event      | host → app | name, data (host-fired and Dev-Tool-fired alike)                     |
| Diagnostic | host       | the dev-only warnings (inapplicable command, out-of-range resize, …) |

- **Ring buffer** (cap ~200 entries) so it cannot grow unbounded.
- **Capture is always on** (cheap); the `log` toggle controls whether the panel
  is shown and live-updating. Toggling back on reveals retained history.
- Outbound Events and Diagnostics are **new** capture points — today only
  Commands and Tracks land in `calls[]`. Plan: widen the internal record to a
  richer entry buffer and derive `getCalls()` from it. **`getCalls()` today
  returns both Commands and Tracks** (`src/index.ts` pushes a Track into `calls[]`
  as `{ command: <event>, args: undefined }`), so the derivation must include
  **both Command and Track** entries — deriving from Command entries alone would
  silently drop Tracks and break the existing `getCalls()` contract. Events and
  Diagnostics stay out of `getCalls()` (log-only), keeping its `{ command, args }[]`
  shape unchanged. A regression test pins the "Tracks still appear in getCalls()"
  behaviour.

## Visual / layout

- Anchored to `devTool.position` (default `bottom-left`); `position: fixed`.
- Collapsible: a compact open panel ↔ a small launcher button (e.g. "🛠 mock").
  `startCollapsed` picks the initial state.
- `z-index` at the snackbar level; the default `bottom-left` corner avoids
  overlap. A centred modal may transiently cover it — acceptable; collapse or
  close the modal. If the developer overrides `position` to `bottom-right`, the
  Dev Tool shares both the corner **and** the z-index with the snackbar, so paint
  order falls to DOM order — a documented consequence of an explicit override,
  not something the tool tries to resolve.
- Follows `config.theme` (light/dark), same as the rest of the host UI.
- No drag/resize of the tool itself (YAGNI).

## Lifecycle

- Built once per host; idempotent builder.
- `teardown()` removes the Dev Tool node **and disconnects the
  `MutationObserver`** along with the rest of the host UI.

## Testing

- **unit (jsdom)**: controls render per active surface type; Focus mode hidden
  unless FW; Resize disabled with no surface; emit buttons call `emitEvent` with
  the correct SDK-shaped payloads; Active Log records each entry type with the
  right direction; ring buffer caps; `log: false` hides the panel; `devTool:
false` renders nothing; production/SSR/`enabled:false` render nothing.
- **Regression**: `getCalls()` still returns **both** Commands and Tracks after
  the internal buffer is widened (guards against the derive-from-Commands-only
  trap); Events and Diagnostics do **not** leak into `getCalls()`.
- **browser (Chromium)**: a real SDK `listen(...)` receives Dev-Tool-emitted
  events; resizing via the Dev Tool changes the surface and is reflected by
  `GET_METADATA`; the controls update both when a Surface wrapper node is
  added/removed **and** when the `pd-mock-*` class is toggled on an existing
  element (exercises the `attributes` observer filter).

## Out of scope

- Firing Commands on the app's behalf (architecturally impossible; see ADR-0009).
- Dragging/free-resizing the tool; persisting Dev Tool state across reloads;
  filtering/search in the Active Log (possible later, not now).
