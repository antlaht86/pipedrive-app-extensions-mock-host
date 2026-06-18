import type { ModalArgs, ModalResult, MockHostConfig } from './index.js';

/**
 * Modal (CONTEXT.md: Custom Modal, Entity Modal, Prefill). The host's only
 * stateful overlay — at most one modal is open at a time, and the host must know
 * which kind so CLOSE_MODAL (custom-only) can tell whether it applies. That state
 * and the two builders live here behind a two-verb interface, rather than loose
 * on the host-effects grab-bag.
 */
export interface Modal {
  /**
   * Open a modal and resolve its result. Routes by the consumer's config and the
   * requested type: the `onModal` override wins; else `custom_modal` loads the
   * configured URL in an iframe; else a native Entity Modal shows the Prefill.
   */
  open(attrs: ModalArgs): Promise<ModalResult>;
  /**
   * Close the open **custom** modal (the CLOSE_MODAL command). Returns false when
   * no custom modal is open — Entity Modals are native forms the app cannot close.
   */
  closeCustom(): boolean;
}

export interface ModalDeps {
  /** Shadow root the modal backdrop mounts into. */
  readonly shadowRoot: ShadowRoot;
  /** Consumer config — the `onModal` override and the `customModals` URL map. */
  readonly config: MockHostConfig;
  /** App name shown in the custom modal's title bar. */
  readonly appName: string;
  /** Emit CLOSE_CUSTOM_MODAL when the custom modal closes (the X or the command). */
  emitClose(): void;
  /** Inject the shared centred-dialog stylesheet (idempotent). */
  ensureDialogStyles(): void;
  /** Build the shared dialog shell (a backdrop and a dialog box). */
  createDialogShell(extraClass?: string): {
    backdrop: HTMLElement;
    dialog: HTMLElement;
  };
}

export function createModal(deps: ModalDeps): Modal {
  const {
    shadowRoot,
    config,
    appName,
    emitClose,
    ensureDialogStyles,
    createDialogShell,
  } = deps;

  // The currently open modal, if any, so closeCustom can dismiss it.
  let resolveOpenModal: ((result: ModalResult) => void) | null = null;
  let removeOpenModal: (() => void) | null = null;
  // Which kind of modal is open, so closeCustom can tell whether it applies.
  // Entity modals (deal/person/…) are native Pipedrive forms the app cannot close.
  let openModalKind: 'custom' | 'entity' | null = null;

  const finishModal = (result: ModalResult): void => {
    removeOpenModal?.();
    removeOpenModal = null;
    openModalKind = null;
    const resolve = resolveOpenModal;
    resolveOpenModal = null;
    resolve?.(result);
  };

  // The title bar Pipedrive frames a shadow-DOM modal dialog with: a title and a
  // close (X) button.
  const buildModalHeader = (
    title: string,
    onClose: () => void,
  ): HTMLElement => {
    const header = document.createElement('div');
    header.className = 'pd-mock-modal-header';
    const titleEl = document.createElement('span');
    titleEl.className = 'pd-mock-modal-title';
    titleEl.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pd-mock-modal-close';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', onClose);
    header.append(titleEl, close);
    return header;
  };

  const openEntityModal = (
    attrs: ModalArgs,
    onResolve: (result: ModalResult) => void,
  ): void => {
    ensureDialogStyles();
    resolveOpenModal = onResolve;
    openModalKind = 'entity';

    const { backdrop, dialog } = createDialogShell();

    const title = document.createElement('h2');
    title.className = 'pd-mock-confirm-title';
    title.textContent = `Modal: ${attrs.type ?? ''}`;
    dialog.appendChild(title);

    const entries = Object.entries(attrs.prefill ?? {});
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pd-mock-prefill-empty';
      empty.textContent = '(no prefill)';
      dialog.appendChild(empty);
    } else {
      const prefill = document.createElement('dl');
      prefill.className = 'pd-mock-prefill';
      for (const [key, value] of entries) {
        const dt = document.createElement('dt');
        dt.className = 'pd-mock-prefill-key';
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.className = 'pd-mock-prefill-val';
        dd.textContent =
          typeof value === 'string' ? value : JSON.stringify(value);
        prefill.append(dt, dd);
      }
      dialog.appendChild(prefill);
    }

    const actions = document.createElement('div');
    actions.className = 'pd-mock-confirm-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'pd-mock-confirm-btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => finishModal({ status: 'closed' }));
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'pd-mock-confirm-btn pd-mock-confirm-btn--ok';
    submitBtn.textContent = 'Submit';
    submitBtn.addEventListener('click', () =>
      finishModal({ status: 'submitted', id: 1 }),
    );
    actions.append(closeBtn, submitBtn);
    dialog.appendChild(actions);

    backdrop.appendChild(dialog);
    shadowRoot.appendChild(backdrop);
    removeOpenModal = () => backdrop.remove();
  };

  const resolveCustomModalUrl = (attrs: ModalArgs): string | undefined => {
    const cm = config.customModals;
    let url: string | undefined;
    if (typeof cm === 'function') {
      url = cm(attrs);
    } else if (cm && attrs.action_id) {
      url = cm[attrs.action_id];
    }
    return url ?? attrs.data?.url;
  };

  const openCustomModal = (
    attrs: ModalArgs,
    onResolve: (result: ModalResult) => void,
  ): void => {
    ensureDialogStyles();
    resolveOpenModal = onResolve;
    openModalKind = 'custom';

    const { backdrop, dialog } = createDialogShell('pd-mock-confirm--custom');

    // Pipedrive frames a custom modal with a title bar and a close (X) button;
    // the X dismisses it, firing CLOSE_CUSTOM_MODAL just like the command does.
    dialog.appendChild(
      buildModalHeader(appName, () => {
        emitClose();
        finishModal({ status: 'closed' });
      }),
    );

    const url = resolveCustomModalUrl(attrs);
    if (url) {
      const iframe = document.createElement('iframe');
      iframe.className = 'pd-mock-custom-frame';
      iframe.title = 'custom modal';
      iframe.src = url;
      dialog.appendChild(iframe);
    } else {
      const placeholder = document.createElement('p');
      placeholder.textContent = `custom_modal: ${attrs.action_id ?? ''} (no URL configured)`;
      dialog.appendChild(placeholder);
    }

    backdrop.appendChild(dialog);
    shadowRoot.appendChild(backdrop);
    removeOpenModal = () => backdrop.remove();
  };

  return {
    open(attrs) {
      if (config.onModal) {
        return (async () => {
          try {
            return (await config.onModal!(attrs)) ?? { status: 'closed' };
          } catch {
            return { status: 'closed' };
          }
        })();
      }
      if (attrs.type === 'custom_modal') {
        return new Promise<ModalResult>((resolve) =>
          openCustomModal(attrs, resolve),
        );
      }
      return new Promise<ModalResult>((resolve) =>
        openEntityModal(attrs, resolve),
      );
    },
    closeCustom() {
      if (openModalKind !== 'custom') {
        return false;
      }
      // Closing via command fires CLOSE_CUSTOM_MODAL, like the user's Close button.
      emitClose();
      finishModal({ status: 'closed' });
      return true;
    },
  };
}
