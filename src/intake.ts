import type { HostEffects } from './host-effects.js';
import type { ConfirmationArgs, ModalArgs } from './index.js';
import {
  COMMAND_CLOSE_MODAL,
  COMMAND_GET_METADATA,
  COMMAND_GET_SIGNED_TOKEN,
  COMMAND_HIDE_FLOATING_WINDOW,
  COMMAND_INITIALIZE,
  COMMAND_OPEN_MODAL,
  COMMAND_REDIRECT_TO,
  COMMAND_RESIZE,
  COMMAND_SET_FOCUS_MODE,
  COMMAND_SET_NOTIFICATION,
  COMMAND_SHOW_CONFIRMATION,
  COMMAND_SHOW_FLOATING_WINDOW,
  COMMAND_SHOW_SNACKBAR,
} from './wire.js';

/**
 * Command intake (CONTEXT.md): takes a single Command — its name, its arguments,
 * and a one-shot reply — and produces the response, delegating every visible
 * effect to the host-effects. DOM-free: it knows the wire vocabulary (which
 * Commands exist, their argument shapes, which Surface each applies to) but
 * touches no DOM of its own. The router guarantees `reply` fires exactly once.
 *
 * High cyclomatic complexity is intentional and irreducible here: this is a flat
 * command dispatcher (one branch per wire Command), so the count tracks the
 * number of Commands, not tangled logic — cognitive complexity stays low and
 * each case is a few lines. Splitting it would scatter the wire vocabulary.
 */
// fallow-ignore-next-line complexity
export function handleCommand(
  command: string,
  args: unknown,
  reply: (response?: unknown) => void,
  host: HostEffects,
): void {
  switch (command) {
    case COMMAND_INITIALIZE: {
      // The handshake may carry an initial size; apply it to the surface.
      const init = args as
        | { size?: { width?: number; height?: number } }
        | undefined;
      host.surface.decorate();
      host.surface.resize(init?.size, 'initialize');
      reply();
      break;
    }
    case COMMAND_SHOW_SNACKBAR: {
      const snack = args as
        | { message?: string; link?: { url: string; label: string } }
        | undefined;
      host.overlays.snackbar(snack?.message ?? '', snack?.link);
      reply();
      break;
    }
    case COMMAND_SHOW_CONFIRMATION: {
      void host.overlays
        .confirmation(args as ConfirmationArgs)
        .then((confirmed) => reply({ confirmed }));
      break;
    }
    case COMMAND_RESIZE: {
      host.surface.resize(
        args as { width?: number; height?: number },
        'RESIZE',
      );
      reply();
      break;
    }
    case COMMAND_GET_SIGNED_TOKEN: {
      void host.overlays.signedToken().then((token) => reply({ token }));
      break;
    }
    case COMMAND_SET_NOTIFICATION: {
      if (!host.surface.requireFloatingWindow('SET_NOTIFICATION')) {
        reply();
        break;
      }
      const notif = args as { number?: number } | undefined;
      host.surface.setNotification(notif?.number);
      reply();
      break;
    }
    case COMMAND_OPEN_MODAL: {
      void host.overlays
        .openModal(args as ModalArgs)
        .then((result) => reply(result));
      break;
    }
    case COMMAND_CLOSE_MODAL: {
      // CLOSE_MODAL only applies to custom modals; entity modals are native
      // Pipedrive forms the app cannot close. Report and do nothing else, but
      // still reply so the SDK promise resolves.
      if (!host.overlays.closeModal()) {
        console.error(
          '[pipedrive-mock-host] CLOSE_MODAL ignored: no custom modal is open (CLOSE_MODAL applies only to custom modals).',
        );
      }
      reply();
      break;
    }
    case COMMAND_SHOW_FLOATING_WINDOW:
    case COMMAND_HIDE_FLOATING_WINDOW: {
      const visible = command === COMMAND_SHOW_FLOATING_WINDOW;
      const name = visible ? 'SHOW_FLOATING_WINDOW' : 'HIDE_FLOATING_WINDOW';
      // The floating window is unavailable on a panel/modal: report it and do
      // nothing else (no DOM change, no misleading VISIBILITY event) — but still
      // reply so the SDK promise resolves.
      if (!host.surface.requireFloatingWindow(name)) {
        reply();
        break;
      }
      host.surface.setFloatingWindowVisible(visible);
      reply();
      break;
    }
    case COMMAND_REDIRECT_TO: {
      const redir = args as { view?: string } | undefined;
      host.overlays.redirect(redir?.view ?? '');
      reply();
      break;
    }
    case COMMAND_SET_FOCUS_MODE: {
      if (!host.surface.requireFloatingWindow('SET_FOCUS_MODE')) {
        reply();
        break;
      }
      host.surface.setFocusMode(args === true);
      reply();
      break;
    }
    case COMMAND_GET_METADATA: {
      // windowWidth/windowHeight are the HOSTING WINDOW dimensions, not the
      // surface's own size. In dev the hosting window is the browser viewport.
      reply(host.overlays.metadata());
      break;
    }
    default:
      // Not-yet-implemented command: reply with an empty object (not undefined)
      // so the SDK's promise resolves and consumer code that destructures the
      // result does not throw.
      reply({});
  }
}
