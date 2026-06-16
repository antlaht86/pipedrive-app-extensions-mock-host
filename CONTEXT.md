# Pipedrive App Extensions Mock Host

The package `pipedrive-app-extensions-mock-host`: a development-only library that
lets an app extension's code run on `localhost`
as if it were embedded inside Pipedrive. It does not replace the Pipedrive SDK;
it plays the part of the Pipedrive window that the SDK talks to.

## Language

**Mock Host**:
The library this project ships. It listens for the messages the real Pipedrive
SDK posts and answers them — playing the role Pipedrive normally plays.
_Avoid_: simulator, fake SDK, mock SDK, stub (it is a host, not an SDK).

**Real SDK**:
The published `@pipedrive/app-extensions-sdk` package, used unchanged by the
consumer. The Mock Host is built _against_ it, not _instead of_ it.
_Avoid_: SDK mock, our SDK.

**App Extension**:
The consumer's code — the custom UI that imports the Real SDK and calls it. In
production it runs inside a Pipedrive iframe; in development it runs in a
`localhost` tab talking to the Mock Host.
_Avoid_: plugin, widget, app (ambiguous), iframe.

**Command**:
A request the App Extension sends and expects a single reply to (e.g. show a
snackbar, open a modal). One request, one response, over a `MessageChannel`.
_Avoid_: action, call, message (too generic).

**Event**:
A message the Mock Host pushes _to_ the App Extension over time on an open
channel (e.g. visibility changed, theme changed). Host-initiated, ongoing.
_Avoid_: notification, signal.

**Track**:
A fire-and-forget message the App Extension sends with no reply (e.g.
`FOCUSED`). The Mock Host receives but never answers it.
_Avoid_: analytics, log event.

**Surface**:
The element that stands in for the place in Pipedrive where the App Extension
renders. `RESIZE` sizes it and `GET_METADATA` measures it. A Surface has a
concrete **type** — Custom Panel, Custom Modal, or Floating Window — each a
different location with its own size rules and behaviour.
_Avoid_: container, wrapper (use Surface or a specific type).

**Custom Panel**:
The Surface type that lives in the left sidebar of a deal/person/organization
detail view — the App Extension's default home. Fixed width (~385px); only its
height changes, clamped to 100–750px (`RESIZE` ignores width).
_Avoid_: panel wrapper, sidebar.

**Custom Modal**:
The Surface type opened on demand over the page via `OPEN_MODAL` (type
`custom_modal`); centred and dismissable, min 120px tall / 320px wide, growing
up to the browser size. A distinct location from the Custom Panel — opening one
does not move the App Extension out of its panel.

**Entity Modal**:
A modal opened via `OPEN_MODAL` with a Pipedrive-native record type — `deal`,
`person`, `organization`, or `activity` — that brings up Pipedrive's own
create-record form. Distinct from a Custom Modal (which loads the App
Extension's own page) and a JSON Modal. It is not a Surface: opening one does
not move the App Extension out of its panel, and it returns `{ status, id }`.
_Avoid_: native modal, form modal.

**Prefill**:
The optional values an Entity Modal carries to pre-populate the create-record
form's fields (e.g. an activity's `subject`, `dueDate`, `deal`). Input only —
the form's response never echoes the prefill back. Lets the App Extension open
the form with sensible defaults instead of an empty form.

**Floating Window**:
The Surface type toggled via `SHOW_FLOATING_WINDOW` / `HIDE_FLOATING_WINDOW`; a
small persistent window (e.g. for call controls), 70–700px tall and 200–800px
wide, independent of the panel.

**Focus mode**:
A mode toggled via `SET_FOCUS_MODE` that keeps the user from closing the Floating
Window — its close control is disabled while focus mode is on. Floating-Window
only; it does not apply to the Custom Panel or Custom Modal.
_Avoid_: lock mode, modal mode.

**Snackbar**:
A transient message shown by `SHOW_SNACKBAR`. It is **not** a Surface — it
appears at the browser's bottom-right corner, outside every Surface, and never
nests inside the panel/modal/floating window.

## Example dialogue

> **Dev:** When the App Extension calls `execute(SHOW_SNACKBAR)`, who renders it?
> **Expert:** The Mock Host. The Real SDK just posts a Command and waits; in
> production Pipedrive renders the snackbar, in dev the Mock Host does.
> **Dev:** And theme changes?
> **Expert:** That's an Event — the Mock Host pushes `USER_SETTINGS_CHANGE` to
> the App Extension; the App Extension didn't ask for it.
> **Dev:** `FOCUSED`?
> **Expert:** A Track. The Real SDK fires it on window focus; the Mock Host
> swallows it. No reply.
