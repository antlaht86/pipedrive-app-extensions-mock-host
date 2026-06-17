# Scroll layer: emulate the production surface frame without an iframe

In production, Pipedrive renders each surface as a real `<iframe>` inside an
`overflow: hidden` wrapper:

```html
<div class="AppExtensionsBlocks_iframeWrapper" style="overflow: hidden">
  <iframe class="AppExtensionsBlocks_iframe" style="height: 500px; width: 100%">…</iframe>
</div>
```

A consumer's bottom-pinned footer (`position: fixed; bottom: 0`) stays pinned to
the surface bottom while the app content scrolls **because the iframe is its own
viewport**: the iframe is stationary, the app document scrolls inside it, and the
fixed element pins to that viewport. No wrapper CSS does it — the iframe does.

The Mock Host renders a surface as a plain `<div>` (ADR-0005), not an iframe (a
real iframe was explicitly rejected: it needs a separate document/origin and
breaks the "your app shares the page" dev model). A single scrolling `<div>`
cannot reproduce the pinning: if the same element both scrolls (`overflow: auto`)
and is the fixed-positioning containing block (`transform`/`position`), a
`position: fixed` child behaves like `absolute` and scrolls away with the
content. **The containing block and the scroll container must be different
elements.**

So we mirror production's two boxes with two `<div>`s. When a consumer wraps
their content in `<div class="pd-mock-scroll-layer">`, the surface wrapper
becomes the non-scrolling **frame** (the `iframeWrapper` analog) and the scroll
layer becomes the single scroller (the `iframe` analog):

```
.pd-mock-panel                      ← frame: overflow:hidden, flex column,
  ├─ .pd-mock-surface-header           transform → fixed-positioning containing block
  └─ .pd-mock-scroll-layer           ← the only scroll container (overflow:auto)
       └─ …consumer content, incl. position:fixed footer…
```

A bottom-pinned footer then pins to the frame instead of the browser window, and
there is exactly one scrollbar — matching production.

## The scroll layer is the consumer's, not the host's

The host does **not** move the consumer's children into the scroll layer. The
consumer adds the wrapper themselves (in their own markup/JSX). This is
deliberate: surfaces are routinely framework-rendered (the playgrounds render
`.pd-mock-panel` with React), and a framework owns the DOM nodes it renders.
Re-parenting React/Vue/Svelte-managed nodes from JavaScript desynchronizes the
framework's view of the tree and crashes it on the next update or unmount
(`removeChild` on a node that is no longer a direct child). The host already only
*prepends* its header (a sibling a framework tolerates); it never re-parents.
This also matches production, where the scrolling layer is the app's own
document — inherently owned by the consumer.

## Opt-in via `:has()`, not a hard default

The frame behaviour is gated on `.pd-mock-panel:has(> .pd-mock-scroll-layer)`
(and the modal/floating-window equivalents). A surface **without** a scroll layer
keeps scrolling itself, exactly as before — no silent content clipping, no config
flag, no JavaScript. The frame switches on precisely when the consumer adopts the
production-faithful structure. (No existing consumers depend on the old
behaviour; the gate is chosen as the safer default, not for back-compat.)

## Considered alternatives

- **One real `<iframe>` per surface.** Most faithful, but reintroduces the iframe
  the project rejects (separate document/origin; the app no longer shares the
  page).
- **`transform`/`position` on the single scrolling surface.** Fails by
  definition: one element cannot be both the scroll container and the fixed
  containing block (the footer scrolls with the content).
- **`position: sticky; bottom: 0` footer.** Fails: a trailing element has nothing
  below it to stick against; it never lifts off the bottom.
- **Host moves consumer content into an injected scroll layer.** Most "free" for
  the consumer, but crashes framework-managed surfaces (see above).

## Consequences

- `.pd-mock-scroll-layer` is public consumer API: a documented class the consumer
  applies to one wrapper element. Its CSS (`flex: 1 1 auto; min-height: 0;
  overflow: auto`) is surface-agnostic.
- Applies to all three div surfaces (panel, modal, floating window). The panel
  and floating window get `transform: translateZ(0)` to establish the containing
  block; the modal already has `transform: translateX(-50%)` (it docks to the
  top-centre), so it is **not** given another transform (that would break its
  positioning). All
  three match production's "flex-column frame + non-shrinking header + scrolling
  content" shape: the panel's `.AppExtensionsBlocks_iframeWrapper`, the modal's
  `.cui5-modal__wrap` → `.cui5-modal__header` (`flex-shrink: 0`) →
  `.cui5-modal__content` (`overflow: auto`), and the floating window's
  `.AppExtensionsBlocks_content` (`overflow: hidden`) whose inner flex column
  holds the drag header and the iframe wrapper.
- The consumer keeps using `position: fixed; bottom: 0` for a pinned footer —
  the same CSS that works in production. If their layout does not already reserve
  the footer's height, they add `padding-bottom: <footer height>` to the scroll
  layer so the last content clears the footer.
- `RESIZE` still sizes the surface wrapper (the frame); the scroll layer fills the
  remaining height via flex. In production the height is set on the inner iframe;
  the visible result is the same and `applySize` is unchanged.
- Requires `:has()` (all evergreen browsers, 2023+). Acceptable: the Mock Host is
  a development-only tool.
