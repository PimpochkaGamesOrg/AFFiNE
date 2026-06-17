import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { ButtonBlockSchemaExtension } from '@blocksuite/affine-model';

export class ButtonStoreExtension extends StoreExtensionProvider {
  override name = 'affine-button-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(ButtonBlockSchemaExtension);
  }
}
