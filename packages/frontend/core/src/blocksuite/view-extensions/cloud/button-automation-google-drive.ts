import type { FetchService } from '@affine/core/modules/cloud';
import {
  createGoogleDriveFolders,
  ensureGoogleDriveAuthorized,
} from '@affine/core/modules/google-drive/client';
import {
  type ButtonAutomationProvider,
  ButtonAutomationProviderIdentifier,
  createDefaultButtonAutomationProvider,
} from '@blocksuite/affine/blocks/button';
import type { ExtensionType } from '@blocksuite/store';

export function patchButtonAutomationGoogleDrive(
  fetchService: FetchService
): ExtensionType {
  return {
    setup: di => {
      const prevFactory = di.getFactory(ButtonAutomationProviderIdentifier);

      di.override(ButtonAutomationProviderIdentifier, provider => {
        const base: ButtonAutomationProvider = prevFactory
          ? prevFactory(provider)
          : createDefaultButtonAutomationProvider();

        return {
          ...base,
          googleDrive: {
            ensureAuthorized: () => ensureGoogleDriveAuthorized(fetchService),
            createFolders: request =>
              createGoogleDriveFolders(fetchService, request),
          },
        };
      });
    },
  };
}
