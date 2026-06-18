import { EVENT_PAGE_VISIBILITY_STATE } from './wire.js';

/** A line written to the Dev Tool's Active Log. */
export type LogFn = (
  direction: string,
  kind: string,
  name: string,
  payload?: unknown,
) => void;

/**
 * Event push (CONTEXT.md "Event"): the host-initiated channel. Owns the open
 * listener ports the App Extension registered via `sdk.listen`, keyed by event
 * name, and pushes a payload to every port for an event. The
 * PAGE_VISIBILITY_STATE special case is sealed in here (the SDK registers no host
 * listener for it — it watches the page's own `visibilitychange`), so the rest of
 * the host never sees that gymnastics.
 */
export interface Events {
  /** Keep a listener port and push to it on `emit`. */
  register(event: string, port: MessagePort): void;
  /** Push an event payload to every listener registered for it. */
  emit(event: string, data: unknown): void;
  /** Drop all listener ports (teardown). */
  clear(): void;
}

export interface EventsDeps {
  /** Optional Active-Log writer; emits log `host → app` when present. */
  readonly log?: LogFn;
}

// PAGE_VISIBILITY_STATE never travels a host port: the SDK watches the page's own
// `document` `visibilitychange` and reports `document.visibilityState`. So to
// drive the app's listener we simulate a real visibility change: momentarily
// override `document.visibilityState`, dispatch the event the SDK listens for,
// then restore it immediately so no global state leaks.
const dispatchPageVisibility = (state: 'visible' | 'hidden'): void => {
  const original = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  // Restore in `finally` so a throwing listener can never leave the override
  // (and thus a wrong global `document.visibilityState`) in place.
  try {
    document.dispatchEvent(new Event('visibilitychange'));
  } finally {
    if (original) {
      Object.defineProperty(document, 'visibilityState', original);
    } else {
      delete (document as { visibilityState?: unknown }).visibilityState;
    }
  }
};

export function createEvents(deps: EventsDeps = {}): Events {
  const listeners = new Map<string, Set<MessagePort>>();
  return {
    register(event, port) {
      const ports = listeners.get(event) ?? new Set<MessagePort>();
      ports.add(port);
      listeners.set(event, ports);
    },
    emit(event, data) {
      deps.log?.('host → app', 'event', event, data);
      if (event === EVENT_PAGE_VISIBILITY_STATE) {
        const state = (data as { state?: 'visible' | 'hidden' })?.state;
        dispatchPageVisibility(state === 'hidden' ? 'hidden' : 'visible');
        return;
      }
      const ports = listeners.get(event);
      if (!ports) {
        return;
      }
      for (const port of ports) {
        port.postMessage({ data });
      }
    },
    clear() {
      listeners.clear();
    },
  };
}
