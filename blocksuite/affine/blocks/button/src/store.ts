import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { ButtonBlockSchemaExtension } from '@blocksuite/affine-model';

import { ButtonAutomationProviderExtension } from './services/button-automation-provider.js';

export class ButtonStoreExtension extends StoreExtensionProvider {
  override name = 'affine-button-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(ButtonBlockSchemaExtension);
    context.register(ButtonAutomationProviderExtension());
  }
}
