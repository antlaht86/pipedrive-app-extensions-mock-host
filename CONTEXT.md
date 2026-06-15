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
The element that stands in for the Pipedrive panel/iframe the App Extension
would normally live in. `RESIZE` sizes it and `GET_METADATA` measures it. The
consumer designates one (element or selector); absent that, it is the document
body.
_Avoid_: container, wrapper (use Surface), panel, iframe.

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
