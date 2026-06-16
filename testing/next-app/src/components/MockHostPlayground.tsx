import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  startPipedriveMockHost,
  type MockHost,
} from 'pipedrive-app-extensions-mock-host';
import AppExtensionsSDK, {
  Color,
  Command,
  Event,
  Modal,
  View,
} from '@pipedrive/app-extensions-sdk';

export type SurfaceKind = 'panel' | 'modal' | 'floating-window';

// One source per surface dimension, so the size, the "max" label, and the
// size-coupled positioning (centre offset, gutter width) below all derive from
// the same number and can't drift apart. Panel width is fixed by the host.
const PANEL_W = 385;
const PANEL_H = 750;
const MODAL_W = 520;
const MODAL_H = 420;
const FW_W = 800;
const FW_H = 700;

const SURFACES: Record<
  SurfaceKind,
  {
    className: string;
    size: { width?: number; height?: number };
    label: string;
    max: string;
    // Demo-only positioning of the surface wrapper. The modal (centred) and
    // floating window (top-right) are already placed by the host's own CSS;
    // only the panel — which the host leaves in page flow — needs pinning.
    wrapperStyle?: React.CSSProperties;
    // Reserve a gutter on the side the (fixed) surface occupies so the controls
    // are never hidden underneath it.
    gutterStyle?: React.CSSProperties;
  }
> = {
  panel: {
    className: 'pd-mock-panel',
    size: { height: PANEL_H },
    label: 'Custom Panel',
    max: `${PANEL_W} × ${PANEL_H}`,
    // Anchored by a fixed top (centred for the default height) rather than
    // translateY(-50%), so a RESIZE keeps the top edge put and grows downward.
    wrapperStyle: {
      position: 'fixed',
      left: '1.5rem',
      top: `calc(50vh - ${PANEL_H / 2}px)`,
    },
    gutterStyle: { paddingLeft: `calc(${PANEL_W}px + 3rem)` },
  },
  modal: {
    className: 'pd-mock-modal',
    // A centred dialog — kept to a readable size so the controls stay visible
    // to its left rather than being buried under a viewport-filling overlay.
    size: { width: MODAL_W, height: MODAL_H },
    label: 'Custom Modal',
    max: `${MODAL_W} × ${MODAL_H}`,
    // Half the dialog (it is centred) plus a 44px clearance from its edge.
    gutterStyle: { paddingRight: `calc(50vw + ${MODAL_W / 2}px + 2.75rem)` },
  },
  'floating-window': {
    className: 'pd-mock-floating-window',
    size: { width: FW_W, height: FW_H },
    label: 'Floating Window',
    max: `${FW_W} × ${FW_H}`,
    gutterStyle: { paddingRight: `calc(${FW_W}px + 3.5rem)` },
  },
};

// Map the host's own shadow-DOM UI onto the console palette via its CSS vars.
const HOST_THEME: Record<string, string> = {
  '--pd-mock-surface-bg': '#11161f',
  '--pd-mock-bg': '#161d28',
  '--pd-mock-fg': '#e7edf4',
  '--pd-mock-muted': '#76859b',
  '--pd-mock-border': '#222b39',
  '--pd-mock-link': '#34e08a',
  '--pd-mock-accent': '#34e08a',
  '--pd-mock-accent-fg': '#06140c',
  '--pd-mock-negative': '#ff5d57',
  '--pd-mock-badge-bg': '#34e08a',
  '--pd-mock-badge-fg': '#06140c',
  '--pd-mock-indicator-bg': '#161d28',
  '--pd-mock-indicator-fg': '#34e08a',
  '--pd-mock-backdrop': 'rgba(5, 9, 13, 0.72)',
};

const NAV: { kind: SurfaceKind; href: string }[] = [
  { kind: 'panel', href: '/panel' },
  { kind: 'modal', href: '/modal' },
  { kind: 'floating-window', href: '/floating-window' },
];

// Host → app events the page can emit, as data (mirrors COMMANDS).
const EVENTS: { label: string; event: Event; data: unknown }[] = [
  {
    label: 'VISIBILITY',
    event: Event.VISIBILITY,
    data: { is_visible: true, context: { invoker: 'user' } },
  },
  {
    label: 'USER_SETTINGS_CHANGE',
    event: Event.USER_SETTINGS_CHANGE,
    data: { theme: 'dark' },
  },
  { label: 'CLOSE_CUSTOM_MODAL', event: Event.CLOSE_CUSTOM_MODAL, data: undefined },
];

type LogEntry = { kind: 'cmd' | 'evt' | 'err'; line: string };

export default function MockHostPlayground({
  surface,
}: {
  surface: SurfaceKind;
}) {
  // Opt out of the React Compiler: this component holds imperative SDK/host
  // handles read from event handlers, which the compiler over-memoizes.
  'use no memo';
  const cfg = SURFACES[surface];
  // Imperative handles live in refs (not state): no setState in the effect, no
  // cascading renders, and handlers always read the latest value.
  const sdkRef = useRef<AppExtensionsSDK | null>(null);
  const hostRef = useRef<MockHost | null>(null);
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState('—');
  const [log, setLog] = useState<LogEntry[]>([]);
  // Tracks the floating window's visibility so one control can toggle it.
  const [fwVisible, setFwVisible] = useState(true);

  const add = (kind: LogEntry['kind'], line: string) =>
    setLog((l) => [{ kind, line }, ...l].slice(0, 200));

  useEffect(() => {
    const host = startPipedriveMockHost({
      customModals: { 'demo-modal': '/custom-modal' },
    });
    hostRef.current = host;

    // Theme the host's shadow-DOM UI to match the console.
    const el = document.querySelector<HTMLElement>('pipedrive-mock-host');
    if (el) {
      for (const [k, v] of Object.entries(HOST_THEME)) el.style.setProperty(k, v);
    }

    let cancelled = false;
    void (async () => {
      const sdk = await new AppExtensionsSDK({
        identifier: 'dev-local',
      }).initialize({ size: cfg.size });
      if (cancelled) return;
      sdkRef.current = sdk;
      for (const ev of [
        Event.VISIBILITY,
        Event.USER_SETTINGS_CHANGE,
        Event.CLOSE_CUSTOM_MODAL,
        Event.PAGE_VISIBILITY_STATE,
      ]) {
        sdk.listen(ev, (r) =>
          add('evt', `event ${ev} ${r.data ? JSON.stringify(r.data) : ''}`),
        );
      }
      setReady(true);
      add('cmd', `host started · surface=${surface} · init ${cfg.max}`);
    })();

    return () => {
      cancelled = true;
      host.teardown();
      sdkRef.current = null;
      hostRef.current = null;
    };
  }, [surface, cfg.size, cfg.max]);

  const run = async (
    label: string,
    fn: (s: AppExtensionsSDK) => Promise<unknown>,
  ) => {
    const sdk = sdkRef.current;
    if (!sdk) return;
    try {
      const result = await fn(sdk);
      add('cmd', `▶ ${label}${result ? ' → ' + JSON.stringify(result) : ''}`);
    } catch (err) {
      add(
        'err',
        `✗ ${label}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const emit = (label: string, eventName: Event, data: unknown) => {
    hostRef.current?.emit(eventName, data);
    add('cmd', `◀ emit ${label}`);
  };

  const toggleFloatingWindow = async () => {
    const next = !fwVisible;
    await run(
      next ? 'SHOW_FLOATING_WINDOW' : 'HIDE_FLOATING_WINDOW',
      (s) =>
        s.execute(
          next
            ? Command.SHOW_FLOATING_WINDOW
            : Command.HIDE_FLOATING_WINDOW,
          {},
        ),
    );
    setFwVisible(next);
  };

  const COMMANDS: {
    label: string;
    fn: (s: AppExtensionsSDK) => Promise<unknown>;
  }[] = [
    {
      label: 'SHOW_SNACKBAR',
      fn: (s) =>
        s.execute(Command.SHOW_SNACKBAR, {
          message: 'Deal saved!',
          link: { url: '#', label: 'View' },
        }),
    },
    {
      label: 'SHOW_CONFIRMATION',
      fn: (s) =>
        s.execute(Command.SHOW_CONFIRMATION, {
          title: 'Delete this deal?',
          description: 'This cannot be undone.',
          okText: 'Delete',
          okColor: Color.NEGATIVE,
        }),
    },
    {
      label: 'OPEN_MODAL deal',
      fn: (s) => s.execute(Command.OPEN_MODAL, { type: Modal.DEAL }),
    },
    {
      label: 'OPEN_MODAL custom',
      fn: (s) =>
        s.execute(Command.OPEN_MODAL, {
          type: Modal.CUSTOM_MODAL,
          action_id: 'demo-modal',
        }),
    },
    {
      label: 'OPEN_MODAL activity (prefill)',
      fn: (s) =>
        s.execute(Command.OPEN_MODAL, {
          type: Modal.ACTIVITY,
          prefill: {
            subject: 'Follow-up phone call',
            dueDate: '2022-12-18',
            dueTime: '13:00',
            duration: '00:30',
            note: 'Ask about <b>deal next steps</b>',
            description: 'Discussion about deal specifics',
            deal: 10,
            organization: 2,
          },
        }),
    },
    { label: 'CLOSE_MODAL', fn: (s) => s.execute(Command.CLOSE_MODAL) },
    {
      label: 'REDIRECT_TO deals',
      fn: (s) => s.execute(Command.REDIRECT_TO, { view: View.DEALS, id: 42 }),
    },
    {
      label: 'SET_NOTIFICATION 3',
      fn: (s) => s.execute(Command.SET_NOTIFICATION, { number: 3 }),
    },
    {
      label: 'SET_FOCUS_MODE on',
      fn: (s) => s.execute(Command.SET_FOCUS_MODE, true),
    },
    {
      label: 'SET_FOCUS_MODE off',
      fn: (s) => s.execute(Command.SET_FOCUS_MODE, false),
    },
    {
      label: 'GET_SIGNED_TOKEN',
      fn: (s) => s.execute(Command.GET_SIGNED_TOKEN),
    },
    {
      label: 'RESIZE 400×320',
      fn: (s) => s.execute(Command.RESIZE, { width: 400, height: 320 }),
    },
    {
      label: 'GET_METADATA',
      fn: async (s) => {
        const m = await s.execute(Command.GET_METADATA);
        setMeta(`${m.windowWidth} × ${m.windowHeight}px`);
        return m;
      },
    },
    {
      label: 'SHOW_FLOATING_WINDOW',
      fn: (s) => s.execute(Command.SHOW_FLOATING_WINDOW, {}),
    },
    {
      label: 'HIDE_FLOATING_WINDOW',
      fn: (s) => s.execute(Command.HIDE_FLOATING_WINDOW, {}),
    },
  ];

  return (
    <div className="min-h-screen">
      <Nav active={surface} />

      {/* Reserve space beside the fixed surface so controls stay visible. */}
      <div style={cfg.gutterStyle}>
      <main className="mx-auto max-w-6xl px-5 py-8">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.35em] text-accent">MOCK HOST</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
              {cfg.label.toUpperCase()}
              <span className="text-accent">.</span>
            </h1>
          </div>
          <div className="text-right text-xs text-muted">
            <div>
              <span
                className={`mr-2 inline-block size-2 rounded-full ${
                  ready ? 'bg-accent' : 'bg-muted'
                }`}
              />
              {ready ? 'connected' : 'booting…'}
            </div>
            <div className="mt-1">
              max {cfg.max} · metadata {meta}
            </div>
          </div>
        </header>

        {/* The modal reserves the right half of the viewport, so its page
            stacks the controls into one column to fit the left band. */}
        <div
          className={`grid gap-6 ${
            surface === 'modal' ? '' : 'lg:grid-cols-[1fr_minmax(320px,420px)]'
          }`}
        >
          <section className="space-y-6">
            <Group title="COMMANDS">
              {COMMANDS.map((c) => (
                <Btn
                  key={c.label}
                  disabled={!ready}
                  onClick={() => run(c.label, c.fn)}
                >
                  {c.label}
                </Btn>
              ))}
            </Group>

            {surface === 'floating-window' && (
              <Group title="FLOATING WINDOW · toggle">
                <button
                  type="button"
                  role="switch"
                  aria-checked={fwVisible}
                  disabled={!ready}
                  onClick={toggleFloatingWindow}
                  className="flex items-center gap-3 rounded border border-line bg-elev px-3 py-1.5 text-[12.5px] text-fg transition-colors hover:border-accent disabled:opacity-40"
                >
                  <span
                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                      fwVisible ? 'bg-accent' : 'bg-line'
                    }`}
                  >
                    <span
                      className={`inline-block size-3 rounded-full bg-[#05080c] transition-transform ${
                        fwVisible ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                  {fwVisible ? 'visible — click to hide' : 'hidden — click to show'}
                </button>
              </Group>
            )}

            <Group title="EVENTS · host → app (emit)">
              {EVENTS.map((e) => (
                <Btn
                  key={e.label}
                  disabled={!ready}
                  onClick={() => emit(e.label, e.event, e.data)}
                >
                  emit {e.label}
                </Btn>
              ))}
            </Group>

            <p className="text-xs text-muted">
              The app below lives in{' '}
              <code className="text-accent">
                &lt;div class=&quot;{cfg.className}&quot;&gt;
              </code>
              . The Mock Host sizes &amp; positions it.
            </p>
          </section>

          <section className="lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-lg border border-line bg-[#05080c]">
              <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-muted">
                <span className="size-2 rounded-full bg-negative" />
                <span className="size-2 rounded-full bg-[#f5c542]" />
                <span className="size-2 rounded-full bg-accent" />
                <span className="ml-2">activity.log</span>
                <button
                  className="ml-auto text-muted hover:text-fg"
                  onClick={() => setLog([])}
                >
                  clear
                </button>
              </div>
              <div className="h-[60vh] overflow-auto p-3 text-[12.5px] leading-relaxed">
                {log.length === 0 && (
                  <span className="text-muted">awaiting input…</span>
                )}
                {log.map((entry, i) => (
                  <div
                    key={i}
                    className={
                      entry.kind === 'err'
                        ? 'text-negative'
                        : entry.kind === 'evt'
                          ? 'text-[#f5c542]'
                          : 'text-fg'
                    }
                  >
                    <span className="text-muted">›</span> {entry.line}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
      </div>

      {/* The surface wrapper — sized & positioned by the host, which also
          injects the header bar as the wrapper's first child. Padding lives on
          an inner content box so that header sits flush to the surface edges. */}
      <div className={cfg.className} style={cfg.wrapperStyle}>
        <div style={{ padding: 14 }}>
          <div className="text-xs tracking-widest text-accent">APP SURFACE</div>
          <div className="mt-1 text-sm font-bold">{cfg.label}</div>
          <p className="mt-2 text-xs text-muted">
            This box is your app. RESIZE / GET_METADATA target it; it opened at
            its maximum ({cfg.max}).
          </p>
        </div>
      </div>
    </div>
  );
}

function Nav({ active }: { active: SurfaceKind }) {
  return (
    <nav className="sticky top-0 z-10 border-b border-line bg-[#05080c]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-5 py-2.5 text-sm">
        <Link href="/" className="mr-3 font-extrabold tracking-tight">
          pd<span className="text-accent">/</span>mock
        </Link>
        {NAV.map((n) => (
          <Link
            key={n.kind}
            href={n.href}
            className={
              'rounded px-2.5 py-1 ' +
              (active === n.kind
                ? 'bg-accent text-[#06140c]'
                : 'text-muted hover:text-fg')
            }
          >
            {n.kind}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h2 className="mb-3 text-xs tracking-[0.2em] text-muted">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-line bg-elev px-3 py-1.5 text-[12.5px] text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg"
    >
      {children}
    </button>
  );
}
