import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { SlashMenuConfigExtension } from '@blocksuite/affine-widget-slash-menu';
import { BlockViewExtension, FlavourExtension } from '@blocksuite/std';
import { literal } from 'lit/static-html.js';

import { buttonSlashMenuConfig } from './configs/slash-menu.js';
import { createBuiltinToolbarConfigExtension } from './configs/toolbar.js';
import { effects } from './effects.js';
import { ButtonAutomationProviderExtension } from './services/button-automation-provider.js';

export class ButtonViewExtension extends ViewExtensionProvider {
  override name = 'affine-button-block';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register([
      FlavourExtension('affine:button'),
      BlockViewExtension('affine:button', literal`affine-button`),
      ButtonAutomationProviderExtension(),
      SlashMenuConfigExtension('affine:button', buttonSlashMenuConfig),
      ...createBuiltinToolbarConfigExtension('affine:button'),
    ]);
  }
}
