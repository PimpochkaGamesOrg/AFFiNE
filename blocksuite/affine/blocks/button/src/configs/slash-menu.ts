import { focusBlockEnd } from '@blocksuite/affine-shared/commands';
import { isInsideBlockByFlavour } from '@blocksuite/affine-shared/utils';
import type { SlashMenuConfig } from '@blocksuite/affine-widget-slash-menu';
import { SettingsIcon } from '@blocksuite/icons/lit';

export const buttonSlashMenuConfig: SlashMenuConfig = {
  items: [
    {
      name: 'Button',
      description: 'Configurable automation on click. Pick any database in settings.',
      icon: SettingsIcon(),
      searchAlias: ['button', 'automation', 'кнопка'],
      group: '0_Basic@10',
      when: ({ model }) => {
        return !isInsideBlockByFlavour(
          model.store,
          model,
          'affine:edgeless-text'
        );
      },
      action: ({ model, std }) => {
        const { store } = model;
        const parent = store.getParent(model);
        if (!parent) return;

        const index = parent.children.indexOf(model);
        if (index === -1) return;
        const buttonId = store.addBlock(
          'affine:button',
          {},
          parent,
          index + 1
        );
        if (!buttonId) return;
        std.host.updateComplete
          .then(() => {
            const button = std.view.getBlock(buttonId);
            if (!button) return;
            std.command.exec(focusBlockEnd, {
              focusBlock: button,
            });
          })
          .catch(console.error);
      },
    },
  ],
};
