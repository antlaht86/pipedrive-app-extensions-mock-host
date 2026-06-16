# Command applicability per surface

Some App Extension commands are only meaningful on a particular Surface type.
The host now rejects an inapplicable command with a dev-only diagnostic instead
of silently doing the wrong thing.

| Command                                         | Applicable when                     |
| ----------------------------------------------- | ----------------------------------- |
| `CLOSE_MODAL`                                   | a **Custom Modal** is open          |
| `SHOW_FLOATING_WINDOW` / `HIDE_FLOATING_WINDOW` | active surface is a Floating Window |
| `SET_NOTIFICATION` / `SET_FOCUS_MODE`           | active surface is a Floating Window |
| everything else                                 | any surface                         |

## These rules are doc-derived, not from the SDK

The installed `@pipedrive/app-extensions-sdk` encodes **no** surface↔command
coupling: `execute()` only checks that the SDK is initialized and the command is
a known enum value, then posts the message. There is no panel/modal/floating
notion in the client, and `identifier` is the app-extension id, not the surface
type. The constraints above live only in Pipedrive's host and the readme
(`https://pipedrive.readme.io/docs/custom-ui-extensions`). The mock emulates the
host, so it enforces them — the same way ADR-0006 enforces doc-derived size
bounds.

## Enforcement is a dev diagnostic, never a throw

An inapplicable command logs `console.error('[pipedrive-mock-host] <CMD> ignored: …')`,
makes no DOM change, emits no misleading event, and **still replies** so the
SDK promise resolves (never hang the caller). This mirrors the out-of-range
`RESIZE` behaviour (ADR-0006, superseded section).

- The four floating-window-only commands share one guard, `requireFloatingWindow(command)`.
- `SET_FOCUS_MODE` additionally disables the floating window's header close (X)
  button while on, so the user cannot close the window — Pipedrive's focus-mode
  behaviour. This stays floating-window-only: a modal's close button is never
  disabled (the host's screenshots show focus mode on a modal, but we keep the
  command scoped to the floating window per this ADR).
- `CLOSE_MODAL` needs to know whether the open modal is custom: the host tracks
  `openModalKind` (`'custom' | 'entity' | null`). Entity modals (deal/person/…)
  are native Pipedrive forms the app cannot close programmatically.

## CLOSE_CUSTOM_MODAL carries no payload

Closing a Custom Modal — via the `CLOSE_MODAL` command **or** the user's Close
button — fires `CLOSE_CUSTOM_MODAL`. The readme prose says the event reveals
"who triggered the action", but the installed SDK types it as
`EventResponse[CLOSE_CUSTOM_MODAL] = void`. Per the repo rule (installed source
wins over docs), the event carries **no** data; the trigger source is not
included.

## Consequences

- Adding a surface-scoped command means adding it to the matrix and a guard —
  cheap, because the guard is shared.
- The playground shows every command on every page on purpose; clicking a
  surface-scoped command on the wrong page now logs the diagnostic, which
  demonstrates the rule rather than hiding it.
- If a future SDK version encodes applicability, the installed source would win
  and this ADR should be revisited.
