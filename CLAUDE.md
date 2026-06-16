# pipedrive-app-extensions-mock-host

A development-only mock host for the Pipedrive App Extensions SDK. See
`CONTEXT.md` for terminology and `docs/adr/` for architectural decisions.

## Ground every host feature in the real SDK source

**Every host feature MUST be based on the actual code inside
`node_modules/@pipedrive/app-extensions-sdk`** — not on memory, assumptions, or
external docs.

Before implementing or changing how the host handles any command, event, or
track message:

1. Read the relevant source in `node_modules/@pipedrive/app-extensions-sdk`:
   - `dist/index.js` — the runtime: how `execute`/`listen`/`track`/`initialize`
     build messages and over what channel, and exactly what reply shape resolves
     vs rejects the SDK's promises.
   - `dist/types.d.ts` — the authoritative contract: `Command`/`Event`/
     `MessageType`/`Modal`/`ModalStatus`/`Color`/`View` enum values, and each
     command's `Args` and `CommandResponse` / each event's `EventResponse` shape.
2. Make the mock's wire constants, payload parsing, and response shapes match
   that source exactly. The internal wire constants (see ADR-0003) must stay
   equal to the SDK's enum values.
3. If the installed SDK version's behaviour contradicts a doc or this repo's
   notes, the **installed source wins** — and update the docs.

The published version we target is recorded in
`docs/plans/2026-06-15-mock-host-design.md`.

## Keep the documentation in sync with every change

**A change is not done until the documentation reflects it.** Whenever you add,
change, or remove host behaviour, update the docs in the same change — not later:

- **`README.md`** — the public API, config options, supported commands, surfaces,
  and examples. If you touch `MockHostConfig`, the controller API, a command's
  behaviour, or a default, the README must match.
- **`CONTEXT.md`** — the glossary. New or redefined domain terms go here (glossary
  only — no implementation detail).
- **`docs/adr/`** — when a change makes, reverses, or supersedes an architectural
  decision, add or amend an ADR. If new behaviour contradicts an existing ADR,
  mark that ADR superseded rather than leaving it stale.
- **`docs/plans/`** — keep the relevant design/plan doc current when the design
  shifts during implementation.

If a doc and the installed SDK source disagree, the installed source wins and the
doc is corrected (see above). Treat doc updates as part of the diff under review,
the same as code.
