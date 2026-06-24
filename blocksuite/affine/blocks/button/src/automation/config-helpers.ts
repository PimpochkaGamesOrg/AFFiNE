import type {
  ButtonAddPageAction,
  ButtonAutomationConfig,
  ButtonColorCharactersAction,
  ButtonConfirmAction,
  ButtonCreateGoogleDriveFoldersAction,
  ButtonEditAction,
} from '@blocksuite/affine-model';

import { listWorkspaceDatabases } from './database-utils.js';

export type WorkspaceDatabase = {
  databaseDocId: string;
  databaseBlockId: string;
  name: string;
};

export function getWorkspaceDatabases(
  workspace: Parameters<typeof listWorkspaceDatabases>[0]['workspace']
): WorkspaceDatabase[] {
  return listWorkspaceDatabases({ workspace });
}

export function createEmptyConfirmAction(): ButtonConfirmAction {
  return {
    type: 'confirm',
    message: {
      type: 'concat',
      parts: [
        { type: 'literal', value: '' },
        {
          type: 'not_empty_marker',
          value: { type: 'property', name: 'Name' },
          marker: '✅',
        },
      ],
    },
    continueText: 'Continue',
    cancelText: 'Cancel',
  };
}

export function createEmptyAddPageAction(
  database?: WorkspaceDatabase
): ButtonAddPageAction {
  return {
    type: 'add_page',
    databaseDocId: database?.databaseDocId ?? '',
    databaseBlockId: database?.databaseBlockId ?? '',
    databaseName: database?.name,
    template: 'empty',
    properties: {},
  };
}

export function createEmptyEditAction(): ButtonEditAction {
  return {
    type: 'edit',
    target: 'this_page',
    properties: {},
  };
}

export function createEmptyColorCharactersAction(): ButtonColorCharactersAction {
  return { type: 'color_characters' };
}

export function createEmptyCreateGoogleDriveFoldersAction(): ButtonCreateGoogleDriveFoldersAction {
  return {
    type: 'create_google_drive_folders',
    episodeTitle: { type: 'property', name: 'Name' },
    categoryName: {
      type: 'if_empty',
      value: { type: 'property', name: 'Рубрика' },
      // oxlint-disable-next-line unicorn/no-thenable
      then: { type: 'literal', value: 'Без рубрики' },
      else: { type: 'property', name: 'Рубрика' },
    },
    targetProperty: 'Google Drive',
    resultUrlField: 'episodeFolderUrl',
  };
}

export function cloneConfig(
  config: ButtonAutomationConfig
): ButtonAutomationConfig {
  return JSON.parse(JSON.stringify(config)) as ButtonAutomationConfig;
}
