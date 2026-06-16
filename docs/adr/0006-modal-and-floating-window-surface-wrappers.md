# Modal and Floating Window surface wrappers

Extends ADR-0005 to the other two Surface types. The consumer wraps their App
Extension in a plain element with a host-provided class —
`<div class="pd-mock-modal">` or `<div class="pd-mock-floating-window">` — and
the host injects the matching styles. As with the panel, the wrapper is the
Surface that `RESIZE` sizes and `GET_METADATA` measures.

## Per-type size constraints (both dimensions)

Unlike the Custom Panel (fixed width, only height resizes), modal and floating
windows resize in **both** dimensions, each clamped to its real Pipedrive bounds:

| Type            | Width                                 | Height                  |
| --------------- | ------------------------------------- | ----------------------- |
| Custom Panel    | fixed ~385px (`RESIZE` width ignored) | 100–750px               |
| Custom Modal    | 320px – viewport width                | 120px – viewport height |
| Floating Window | 200–800px                             | 70–700px                |

`RESIZE` reads the surface type from its class. The modal's maximum is the live
viewport (`window.innerWidth`/`innerHeight`).

> **Superseded 2026-06-16 — reject, don't clamp.** Originally `RESIZE` *clamped*
> an out-of-range dimension to the nearest bound. Real Pipedrive instead ignores
> an out-of-bounds size (nothing happens), so the host now matches that: if any
> requested dimension is outside its range the whole resize is **rejected**
> (nothing applied) and a `console.error` names the surface, dimension, value and
> allowed range. The same validation applies to the initial size from
> `initialize({ size })`. The panel's fixed width is not a resizable dimension,
> so a requested panel width is ignored (not an error). This is a dev-only
> diagnostic; the bounds table above is unchanged.

## Self-positioning

The wrappers position themselves to match the real surface, rather than sitting
inline like the panel:

- **Custom Modal** — `position: fixed`, centred, with a dimmed backdrop.
- **Floating Window** — `position: fixed`, anchored to a corner.

The consumer can place the `<div>` anywhere in their markup; the injected styles
move it to the right place.

### Resolved details

- **Modal backdrop** is done with a single class, no extra element: the modal
  element gets `box-shadow: 0 0 0 100vmax rgba(20, 24, 31, 0.35)`, which paints a
  dimmed full-viewport spread behind the centred dialog. Keeps it purely
  class-based.
- **Default sizes** (before any `RESIZE`, within bounds): Custom Panel 385×100
  (unchanged), Custom Modal 520×400, Floating Window 320×240.
- **Floating Window corner**: top-right, `2rem` from the top and right edges.
  This keeps it clear of the Snackbar (which is bottom-right), so the two never
  overlap.
- **z-index scale** (bottom → top): Custom Panel (inline, no z) <
  Floating Window `2147483640` < Custom Modal `2147483641` <
  Confirmation dialog `2147483646` < Snackbar `2147483647`. Alerts/transient UI
  sit above surfaces; the modal sits above the floating window.

## Surface resolution (generalizes ADR-0005)

`config.surface` (explicit) → the first `.pd-mock-panel` / `.pd-mock-modal` /
`.pd-mock-floating-window` element in DOM order → `document.body`. The type is
read from the matched element's class. One active surface is assumed per host;
when more than one wrapper is present, the consumer disambiguates with
`config.surface`.

> **Extended 2026-06-16 — match by class _or_ id.** A surface is also recognized
> when the host class is used as the element's `id` (`<div id="pd-mock-panel">`).
> Both `resolveSurface` (the selector) and `surfaceTypeOf` (class _or_ `el.id`)
> honour either form. The injected styles remain class-only, so the id form gives
> a consumer the **behaviour** (RESIZE bounds, `GET_METADATA`, the floating-window
> commands) **without the host's visual styling** — they style the element
> themselves. All surface-type checks route through `surfaceTypeOf`, so the rule
> lives in one place.

## Consequences

- Dimensions are authoritative as of the Pipedrive docs (checked 2026-06): modal
  min 320×120 with no fixed max; floating 200–800 × 70–700. Panel width stays an
  approximation (~385px), as Pipedrive does not publish it.
- These constraints are Pipedrive UI rules, not part of the SDK source, so they
  cannot be grounded in `node_modules/@pipedrive/app-extensions-sdk` (unlike
  command/response shapes, per CLAUDE.md).
- `RESIZE` clamps both dimensions per type. The current `isPanel` special-case in
  the handler is replaced by a small type → bounds table keyed on the surface's
  class, so adding types stays a data change, not another branch.
- Auto-detection is DOM-order-first, so a modal opened over a panel is **not**
  auto-selected (the panel comes first); document that consumers with more than
  one wrapper present must set `config.surface`.
