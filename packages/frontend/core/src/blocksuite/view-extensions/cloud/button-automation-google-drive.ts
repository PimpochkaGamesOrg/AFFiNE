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
      const base =
        di.getOptional(ButtonAutomationProviderIdentifier) ??
        createDefaultButtonAutomationProvider();

      const provider: ButtonAutomationProvider = {
        ...base,
        googleDrive: {
          ensureAuthorized: () => ensureGoogleDriveAuthorized(fetchService),
          createFolders: request =>
            createGoogleDriveFolders(fetchService, request),
        },
      };

      di.override(ButtonAutomationProviderIdentifier, provider);
    },
  };
}
