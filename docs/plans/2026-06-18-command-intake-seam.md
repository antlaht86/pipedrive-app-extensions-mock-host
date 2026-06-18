# Give Command intake a seam below the window

**Status:** implemented 2026-06-18 · **Scope:** `src/index.ts` and its tests

Landed as `src/wire.ts` (shared wire constants), `src/surface.ts` (Surface
helpers), `src/events.ts` (Event push), `src/host-effects.ts` (the grouped seam),
`src/intake.ts` (Command intake), and `src/router.ts` (Message router + the
exactly-once `once`). `startPipedriveMockHost` is now a thin transport adapter
over the router; the public API is unchanged. New seam contract tests live in
`src/router.test.ts`; the existing browser suite (real SDK) and `dev-tool.test.ts`
stay green unchanged as the behaviour-preservation backstop.

## Why

Today the whole host is one ~1160-line `startPipedriveMockHost` closure whose
only seam is `window.addEventListener('message')`. Nothing below that seam can be
exercised without running the entire function and posting a window message — so
`src/dev-tool.test.ts` (and any command-level test in jsdom) hand-forges the SDK
wire envelope `{ payload: { type, command, args } }` and a `MessagePort`.

The deepening introduces three modules and one shared seam so the parse-and-reply
machinery becomes the test surface, and the host gains a second adapter for the
first time:

- **Message router** — discriminates message type, records calls, guarantees one
  reply per Command.
- **Command intake** — DOM-free; turns `(command, args, reply, host)` into a
  response.
- **host-effects** — the grouped collaborator `{ surface, events, overlays,
  config }` that intake (and, later, the Dev Tool) drive. See CONTEXT.md for all
  three glossary entries.

Grounded in the current source: `onMessage` (`src/index.ts:1691–1902`), the 13
command cases, `emitEvent`/`dispatchPageVisibility` (`915–932`, `893–913`), the
surface helpers (`152–176`, `1571–1689`), and the overlay renderers
(`1180–1443`).

## Decisions locked in grilling

1. **Seam sits above the wire envelope.** The transport adapter extracts
   `event.data.payload`, takes `event.ports[0]`, and builds `reply`. Intake never
   sees `window`, a `MessageEvent`, or a `MessagePort`.
2. **Narrow intake + router.** Intake handles only Commands. The router fans out:
   `command → intake`, `listener → Event push registry`, `track → sink`. The
   router owns `calls` recording and `logToDevTool`.
3. **host-effects grouped by module:** `{ surface, events, overlays, config }`.
   A, B (Surface), C (Dev Tool) and D (Event push) all consume the same object.
4. **The interface guarantees exactly-once reply.** The router wraps `reply` in a
   `once` that ignores a second call and dev-warns; the never-hang invariant
   stops being a 13-place convention.

## Shape

```
window ─▶ transport adapter ─▶ Message router ─┬─ command  ─▶ Command intake ─▶ host-effects
            parse, port→reply    type, calls,   ├─ listener ─▶ events.register (D)
                                 log, once()     └─ track    ─▶ sink.record
```

```ts
// host-effects: the grouped seam (initially thin wrappers over today's closures)
interface HostEffects {
  surface: {                                   // → B
    type(): string | undefined;
    resize(size, context): boolean;            // wraps applySize
    requireFloatingWindow(command): boolean;
    setFloatingWindowVisible(visible): void;
    setFocusMode(on): void;
    setNotification(n?): void;
    decorate(): void;                          // initialize handshake
  };
  events: { emit(event, data): void };         // → D (wraps emitEvent)
  overlays: {                                  // host's own shadow-root UI
    snackbar(message, link?): void;
    confirmation(args): Promise<boolean>;
    openModal(attrs): Promise<ModalResult>;    // custom / entity / onModal
    closeModal(): boolean;                     // false when no custom modal open
    redirect(view): void;
    metadata(): { windowWidth: number; windowHeight: number };
  };
  config: MockHostConfig;
}

// Command intake — DOM-free
function handleCommand(command: string, args: unknown,
                       reply: (r?: unknown) => void, host: HostEffects): void
```

## Steps

1. **Define `HostEffects` and back it with thin wrappers.** No behaviour change:
   `surface.resize` calls today's `applySize`, `events.emit` calls `emitEvent`,
   `overlays.snackbar` calls `renderSnackbar`, etc. The closure functions stay
   put; the grouped object just names them. Land green with the existing tests.
2. **Extract `handleCommand` (Command intake), DOM-free.** Move the 13 `switch`
   cases out of `onMessage` into a module that takes `(command, args, reply,
   host)`. Each case calls only `host.*`. The async cases (`SHOW_CONFIRMATION`,
   `GET_SIGNED_TOKEN`, `OPEN_MODAL`) keep replying later through the captured
   `reply`. ADR-0008 guards move behind `host.surface.requireFloatingWindow`.
3. **Add the Message router with `once(reply)`.** The router takes the parsed
   `payload` + a raw reply, wraps the reply so it fires at most once (dev-warn on
   a second call), records the message into `calls`, logs it, then dispatches by
   `type`. `default`/unknown command still replies `{}` through `once`.
4. **Reduce `onMessage` to the transport adapter.** It only extracts
   `data.payload`, grabs `event.ports[0]`, builds the raw `reply`, and calls
   `router.dispatch(payload, reply)`. Listener registration and track recording
   move behind the router.
5. **Migrate jsdom tests to the in-memory adapter.** `src/dev-tool.test.ts` and
   command-level cases call `router.dispatch({ command, args }, spy)` (or
   `handleCommand(...)` with a fake `HostEffects`) instead of dispatching a
   `MessageEvent`. Add a focused router test for the exactly-once guarantee.
6. **Leave the browser tests untouched.** `src/mock-host.browser.test.ts` keeps
   driving through the real SDK over a real `MessageChannel` — it is the
   integration proof that the transport adapter and port handling work. It must
   stay green unchanged.

## Wins

- **Leverage:** one `dispatch` seam; window transport and in-memory test are two
  adapters over it.
- **Locality:** wire vocabulary and the exactly-once guarantee live in one place.
- **Interface is the test surface:** jsdom tests stop forging the wire envelope.
- **Spine for B/C/D:** the `HostEffects` groups are exactly the modules Surface
  (B), Dev Tool (C) and Event push (D) deepen next, behind interfaces this step
  already introduces.

## Non-goals / guardrails

- No public API change: `startPipedriveMockHost` / `MockHost` stay identical.
- No behaviour change in steps 1–4 (pure restructuring); browser tests are the
  backstop.
- ADR-0006 (reject-don't-clamp bounds), ADR-0008 (per-surface applicability) and
  ADR-0009 (Dev Tool mounting/scope, host-producible effects only) are preserved,
  not revisited. No new ADR is required — this changes internal structure, not a
  recorded decision. If step 2 reveals a decision worth fixing (e.g. naming the
  exactly-once guarantee as a contract), add an ADR then.
```
