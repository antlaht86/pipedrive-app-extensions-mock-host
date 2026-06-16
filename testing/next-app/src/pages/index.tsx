import Link from 'next/link';

const SURFACES = [
  {
    href: '/panel',
    name: 'Custom Panel',
    spec: 'fixed 385px · height 100–750',
    blurb: 'The left-sidebar home of a deal/person/org detail view.',
  },
  {
    href: '/modal',
    name: 'Custom Modal',
    spec: 'min 320×120 · max viewport',
    blurb: 'A centred overlay opened on demand over the page.',
  },
  {
    href: '/floating-window',
    name: 'Floating Window',
    spec: '200–800 × 70–700',
    blurb: 'A small persistent window pinned to a corner.',
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <p className="text-xs tracking-[0.4em] text-accent">
        PIPEDRIVE APP EXTENSIONS
      </p>
      <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
        Mock Host
        <span className="text-accent"> control console</span>
      </h1>
      <p className="mt-4 max-w-xl text-sm text-muted">
        A consumer-style Next.js app driving the real{' '}
        <code className="text-fg">@pipedrive/app-extensions-sdk</code> against the
        local mock host. Pick a surface — each page exercises every command and
        event and logs what was pressed. Run with{' '}
        <code className="text-fg">npm run dev</code>.
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {SURFACES.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl border border-line bg-panel p-5 transition-colors hover:border-accent"
            style={{ animation: `rise 0.5s ${i * 0.08}s both ease-out` }}
          >
            <div className="text-[11px] tracking-widest text-muted">
              0{i + 1}
            </div>
            <div className="mt-2 text-lg font-bold group-hover:text-accent">
              {s.name}
            </div>
            <div className="mt-1 text-[11px] text-accent-dim">{s.spec}</div>
            <p className="mt-3 text-xs text-muted">{s.blurb}</p>
            <div className="mt-4 text-xs text-muted group-hover:text-accent">
              open →
            </div>
          </Link>
        ))}
      </div>

      <style jsx>{`
        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </main>
  );
}
