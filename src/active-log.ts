import type { LogFn } from './events.js';

/**
 * Active Log (CONTEXT.md): the Dev Tool's running record of host↔App-Extension
 * activity. It is its own small module because three places write to it — the
 * Message router (app → host commands/tracks), Event push (host → app events) and
 * the Dev Tool's own actions — while the Dev Tool owns where its element renders.
 * Creating it independently breaks the cycle: it has no dependencies, so host,
 * router and the Dev Tool can all be handed the same `write`.
 */
export interface ActiveLog {
  /** The `<ul>` the Dev Tool mounts into its body. Styled by the Dev Tool's CSS. */
  readonly element: HTMLElement;
  /** Prepend a newest-first entry: `<direction> <kind>: <name> <payload?>`. */
  readonly write: LogFn;
}

export function createActiveLog(): ActiveLog {
  const element = document.createElement('ul');
  element.className = 'pd-mock-dev-tool-log';
  element.setAttribute('aria-label', 'Active log');

  const write: LogFn = (direction, kind, name, payload) => {
    const entry = document.createElement('li');
    const detail = payload === undefined ? '' : ` ${JSON.stringify(payload)}`;
    entry.textContent = `${direction} ${kind}: ${name}${detail}`;
    element.prepend(entry);
  };

  return { element, write };
}
