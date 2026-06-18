import type { LogFn } from './events.js';
import type { HostEffects } from './host-effects.js';
import type { MockHostCall } from './index.js';
import { handleCommand } from './intake.js';
import {
  MESSAGE_TYPE_COMMAND,
  MESSAGE_TYPE_LISTENER,
  MESSAGE_TYPE_TRACK,
} from './wire.js';

/** A parsed message off the transport — the SDK's `payload` envelope. */
export interface ParsedMessage {
  type?: string;
  command?: string;
  event?: string;
  args?: unknown;
}

/**
 * Wrap a reply so it fires exactly once: the first call forwards, any later call
 * is dropped with a dev diagnostic. The never-hang invariant (every Command is
 * answered) lives with the handlers; this enforces the other half — a Command is
 * never answered twice — in one place instead of relying on 13 handlers.
 */
export function once(
  reply: (response?: unknown) => void,
): (response?: unknown) => void {
  let answered = false;
  return (response) => {
    if (answered) {
      console.error(
        '[pipedrive-mock-host] a command was answered more than once; the extra reply was ignored.',
      );
      return;
    }
    answered = true;
    reply(response);
  };
}

export interface RouterDeps {
  readonly host: HostEffects;
  /** Optional Active-Log writer; logs `app → host` for commands and tracks. */
  readonly log?: LogFn;
}

export interface Router {
  /**
   * Route one parsed message. `reply` answers a Command (built by the transport
   * from the reply port); `port` is the listener channel for a registration.
   * Both are ignored for message types that do not use them.
   */
  dispatch(
    payload: ParsedMessage,
    reply: (response?: unknown) => void,
    port?: MessagePort,
  ): void;
  /** The Commands and Tracks the App Extension has sent so far. */
  getCalls(): MockHostCall[];
}

/**
 * Message router (CONTEXT.md): discriminates the message type and forwards each
 * to the right place — Commands to the Command intake, listener registrations to
 * Event push, Tracks to the call record. Records every Command and Track for
 * inspection (`getCalls`) and guarantees each Command is answered exactly once.
 */
export function createRouter(deps: RouterDeps): Router {
  const calls: MockHostCall[] = [];
  const log: LogFn = deps.log ?? (() => {});
  // Record a Command or Track for inspection (getCalls) and the Active Log.
  const record = (kind: string, command: string, args: unknown): void => {
    calls.push({ command, args });
    log('app → host', kind, command, args);
  };
  return {
    dispatch(payload, reply, port) {
      const { type, event, command, args } = payload;
      // A listener registration: keep the port and push to it on emit().
      if (type === MESSAGE_TYPE_LISTENER) {
        if (event && port) deps.host.events.register(event, port);
        return;
      }
      // A fire-and-forget track (e.g. FOCUSED): record it, no reply.
      if (type === MESSAGE_TYPE_TRACK) {
        if (event) record('track', event, undefined);
        return;
      }
      // A command: record, then dispatch to the Command intake.
      if (type === MESSAGE_TYPE_COMMAND && command) {
        record('command', command, args);
        handleCommand(command, args, once(reply), deps.host);
      }
    },
    getCalls() {
      return [...calls];
    },
  };
}
