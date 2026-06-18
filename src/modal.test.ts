import { expect, test, vi } from 'vitest';
import { createModal, type Modal } from './modal.js';

// Standalone tests for the Modal seam — constructed directly with a fresh shadow
// root and simple doubles for the shared dialog shell. The modal renders into the
// root and resolves a real promise, so behaviour is observed, not spied.

const makeModal = (
  config = {},
): {
  shadowRoot: ShadowRoot;
  modal: Modal;
  emitClose: ReturnType<typeof vi.fn>;
} => {
  const shadowRoot = document
    .createElement('div')
    .attachShadow({ mode: 'open' });
  const emitClose = vi.fn();
  const modal = createModal({
    shadowRoot,
    config,
    appName: 'Test App',
    emitClose,
    ensureDialogStyles: () => {},
    createDialogShell: (extraClass) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'pd-mock-confirm-backdrop';
      const dialog = document.createElement('div');
      dialog.className = extraClass
        ? `pd-mock-confirm ${extraClass}`
        : 'pd-mock-confirm';
      return { backdrop, dialog };
    },
  });
  return { shadowRoot, modal, emitClose };
};

test('a custom modal loads the configured URL in an iframe', () => {
  const { shadowRoot, modal } = makeModal({
    customModals: { settings: 'https://app.example/settings' },
  });

  void modal.open({ type: 'custom_modal', action_id: 'settings' });

  const iframe = shadowRoot.querySelector<HTMLIFrameElement>(
    'iframe.pd-mock-custom-frame',
  );
  expect(iframe?.getAttribute('src')).toBe('https://app.example/settings');
});

test('closeCustom dismisses the custom modal, emits, and resolves it closed', async () => {
  const { modal, emitClose } = makeModal({
    customModals: { settings: 'https://app.example/settings' },
  });

  const result = modal.open({ type: 'custom_modal', action_id: 'settings' });
  expect(modal.closeCustom()).toBe(true);

  await expect(result).resolves.toEqual({ status: 'closed' });
  expect(emitClose).toHaveBeenCalledTimes(1);
});

test('closeCustom is a no-op when no custom modal is open', () => {
  const { modal, emitClose } = makeModal();

  // Nothing open.
  expect(modal.closeCustom()).toBe(false);

  // An entity modal is open, but it is not a custom modal.
  void modal.open({ type: 'deal' });
  expect(modal.closeCustom()).toBe(false);
  expect(emitClose).not.toHaveBeenCalled();
});

test('an entity modal renders its prefill and submitting resolves with an id', async () => {
  const { shadowRoot, modal } = makeModal();

  const result = modal.open({ type: 'activity', prefill: { subject: 'Call' } });

  expect(shadowRoot.textContent).toContain('subject');
  expect(shadowRoot.textContent).toContain('Call');

  shadowRoot
    .querySelector<HTMLButtonElement>('.pd-mock-confirm-btn--ok')
    ?.click();
  await expect(result).resolves.toEqual({ status: 'submitted', id: 1 });
});

test('the onModal override resolves its result and renders nothing', async () => {
  const { shadowRoot, modal } = makeModal({
    onModal: async () => ({ status: 'submitted', id: 7 }),
  });

  await expect(modal.open({ type: 'deal' })).resolves.toEqual({
    status: 'submitted',
    id: 7,
  });
  expect(shadowRoot.querySelector('.pd-mock-confirm-backdrop')).toBeNull();
});
