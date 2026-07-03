import type { useConfirmModal } from '@affine/component';
import {
  type ButtonAutomationProvider,
  ButtonAutomationProviderIdentifier,
  createDefaultButtonAutomationProvider,
} from '@blocksuite/affine/blocks/button';
import type { ExtensionType } from '@blocksuite/store';

export function patchButtonAutomationConfirm(
  confirmModal: ReturnType<typeof useConfirmModal>
): ExtensionType {
  return {
    setup: di => {
      const base =
        di.getOptional(ButtonAutomationProviderIdentifier) ??
        createDefaultButtonAutomationProvider();

      const provider: ButtonAutomationProvider = {
        ...base,
        showConfirm: input =>
          new Promise(resolve => {
            confirmModal.openConfirmModal({
              description: input.message,
              confirmText: input.continueText,
              cancelText: input.cancelText,
              confirmButtonOptions: { variant: 'primary' },
              onConfirm: () => resolve({ confirmed: true }),
              onCancel: () => resolve({ confirmed: false }),
            });
          }),
      };

      di.override(ButtonAutomationProviderIdentifier, provider);
    },
  };
}
