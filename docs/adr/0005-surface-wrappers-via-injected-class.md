# Surface wrappers via a host-injected class

The consumer mounts their App Extension by wrapping it in a plain element with a
host-provided class — `<div class="pd-mock-panel">…</div>` — and the Mock Host
injects the matching styles into `document.head` when it starts. That element
becomes the **Surface**: `RESIZE` sizes it and `GET_METADATA` measures it. The
class also declares the Surface **type**, so the host applies that type's real
Pipedrive constraints. For a Custom Panel: fixed ~385px width and height clamped
to 100–750px, with `RESIZE`'s `width` argument ignored — exactly as Pipedrive
behaves. Sibling types follow as `pd-mock-modal` and `pd-mock-floating-window`.

Surface resolution order: explicit `config.surface` → first `.pd-mock-*` element
found → `document.body`. A plain element passed via `config.surface` with no
`pd-mock-*` class is an untyped Surface (free resize, no clamping); the class is
what opts into a type's look and constraints.

## Considered alternatives

- **Importable custom element** (`<pipedrive-mock-panel>`): self-contained, but
  needs element registration and a second mounting mechanism competing with the
  already-locked `config.surface`.
- **Config-only** (`surface: { type: 'panel', element }`): no markup, but the
  host has to reach into and restyle the consumer's element, and it doesn't match
  the consumer's "everything goes _inside_ the wrapper" mental model.

A class on a plain `<div>` is the lightest thing that works in any framework and
in vanilla HTML, needs no element registration, and reads naturally as a wrapper.

## Consequences

- The host injects one global stylesheet (class names prefixed `pd-mock-` to
  avoid colliding with consumer CSS).
- Snackbars are unaffected: they are viewport-level (browser bottom-right),
  rendered in the host's own shadow DOM, never inside a Surface.
- The exact panel width is not published by Pipedrive; we use 385px as a
  configurable approximation.
