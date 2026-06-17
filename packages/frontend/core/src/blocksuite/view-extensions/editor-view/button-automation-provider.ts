import { notify } from '@affine/component';
import {
  type ButtonAutomationNotification,
  ButtonAutomationProviderExtension,
  createDefaultButtonAutomationProvider,
} from '@blocksuite/affine/blocks/button';
import type { ExtensionType } from '@blocksuite/affine/store';

function showButtonAutomationNotification({
  title,
  accent,
}: ButtonAutomationNotification) {
  switch (accent) {
    case 'success':
      notify.success({ title });
      return;
    case 'error':
      notify.error({ title });
      return;
    case 'warning':
      notify.warning({ title });
      return;
    default:
      notify({ title });
  }
}

export function patchButtonAutomationProvider(): ExtensionType {
  const base = createDefaultButtonAutomationProvider();
  return ButtonAutomationProviderExtension({
    ...base,
    notify: showButtonAutomationNotification,
  });
}
