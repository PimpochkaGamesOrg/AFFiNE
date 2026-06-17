import { ButtonBlockModel } from '@blocksuite/affine-model';
import {
  ActionPlacement,
  type ToolbarAction,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { DeleteIcon, SettingsIcon } from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';

import { ButtonBlockComponent } from '../button-block.js';
import { openButtonConfigPanel } from '../components/button-config-panel.js';

const configureAction = {
  id: 'configure',
  label: 'Configure',
  tooltip: 'Configure button automation',
  icon: SettingsIcon(),
  run(ctx) {
    const model = ctx.getCurrentModelByType(ButtonBlockModel);
    const block = ctx.getCurrentBlockByType(ButtonBlockComponent);
    if (!model || !block) return;
    openButtonConfigPanel(model, block, config => {
      ctx.store.updateBlock(model, {
        automation: config,
      });
    });
  },
} satisfies ToolbarAction;

const builtinToolbarConfig = {
  actions: [
    configureAction,
    {
      placement: ActionPlacement.More,
      id: 'c.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const model = ctx.getCurrentModelByType(ButtonBlockModel);
        if (!model) return;
        ctx.store.deleteBlock(model);
        ctx.select('note');
        ctx.reset();
      },
    } satisfies ToolbarAction,
  ],
} as const satisfies ToolbarModuleConfig;

export const createBuiltinToolbarConfigExtension = (
  flavour: string
): ExtensionType[] => {
  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(flavour),
      config: builtinToolbarConfig,
    }),
  ];
};
