# Render UI into an open Shadow DOM

The Mock Host renders all visible UI (snackbar, confirmation, modal, floating
window, notification badge) into a single custom-element host attached to an
**open** Shadow DOM, with internal styles scoped to that root and theming driven
by CSS custom properties.

The library is dropped into arbitrary consumer apps (React, Vue, Tailwind, …),
so the consumer's global CSS must not be able to mangle our dialogs, and our
styles must not leak into their app. Shadow DOM is the mechanism built for
exactly this two-way isolation. We picked **open** (not closed) so our own
browser tests — and consumers who want them — can reach `host.shadowRoot` to
query the UI.

## Consequences

- Testing Library's `getByRole`/`getByText` do **not** pierce the shadow
  boundary by default. Tests query via `within(host.shadowRoot)` (or an
  equivalent helper), not the document. This is a deliberate, accepted cost of
  isolation.
- Theming (`USER_SETTINGS_CHANGE` dark/light) is applied by toggling CSS custom
  properties on the shadow root, not by class names on the consumer's document.
