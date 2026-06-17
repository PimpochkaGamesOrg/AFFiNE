import { DatabaseBlockDataSource } from '@blocksuite/affine-block-database';
import type { ButtonSourceContext } from '@blocksuite/affine-model';
import { createIdentifier } from '@blocksuite/global/di';
import type { BlockStdScope } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';

import {
  findDatabaseInWorkspace,
  findSourceRowForDoc,
  listWorkspaceDatabases,
} from '../automation/database-utils.js';
import type {
  ButtonAutomationContextProvider,
  DatabaseTarget,
} from '../automation/types.js';
import { ensureButtonConfirmDialog } from '../components/confirm-dialog.js';

export type ButtonAutomationNotification = {
  title: string;
  accent?: 'success' | 'warning' | 'error';
};

export type ButtonAutomationProvider = ButtonAutomationContextProvider & {
  notify?: (input: ButtonAutomationNotification) => void;
};

export const ButtonAutomationProviderIdentifier =
  createIdentifier<ButtonAutomationProvider>('ButtonAutomationProvider');

export function getButtonAutomationProvider(
  std: BlockStdScope
): ButtonAutomationProvider | null {
  return std.getOptional(ButtonAutomationProviderIdentifier) ?? null;
}

export function createDefaultButtonAutomationProvider(): ButtonAutomationProvider {
  return {
    async resolveSourceContext({
      host,
      currentDocId,
      storedSource,
      sourceDatabase,
    }) {
      if (storedSource) {
        const database = findDatabaseInWorkspace(
          host.store.workspace,
          storedSource.databaseDocId,
          storedSource.databaseBlockId
        );
        if (database) {
          const dataSource = new DatabaseBlockDataSource(database);
          if (dataSource.rows$.value.includes(storedSource.rowId)) {
            return storedSource;
          }
        }
      }
      return findSourceRowForDoc(
        host.store.workspace,
        currentDocId,
        sourceDatabase
      );
    },
    async resolveDatabaseTarget({ host, databaseDocId, databaseBlockId }) {
      const database = findDatabaseInWorkspace(
        host.store.workspace,
        databaseDocId,
        databaseBlockId
      );
      if (!database) return undefined;
      const dataSource = new DatabaseBlockDataSource(database, ds => {
        ds.serviceSet('EditorHostKey' as never, host);
      });
      return {
        databaseDocId,
        databaseBlockId,
        database,
        dataSource,
      };
    },
    async findDatabaseByName({ host, name }) {
      const match = listWorkspaceDatabases({
        workspace: host.store.workspace,
      }).find(
        item => item.name.trim().toLowerCase() === name.trim().toLowerCase()
      );
      if (!match) return undefined;
      return this.resolveDatabaseTarget({
        host,
        databaseDocId: match.databaseDocId,
        databaseBlockId: match.databaseBlockId,
      });
    },
    buildDocUrl(docId, host) {
      const origin = typeof location !== 'undefined' ? location.origin : '';
      return `${origin}/workspace/${host.store.workspace.id}/${docId}`;
    },
    async showConfirm(input) {
      const dialog = ensureButtonConfirmDialog();
      return dialog.open({
        message: input.message,
        continueText: input.continueText,
        cancelText: input.cancelText,
      });
    },
  };
}

export function ButtonAutomationProviderExtension(
  provider: ButtonAutomationProvider = createDefaultButtonAutomationProvider()
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(ButtonAutomationProviderIdentifier, provider);
    },
  };
}

export type { ButtonSourceContext, DatabaseTarget };
