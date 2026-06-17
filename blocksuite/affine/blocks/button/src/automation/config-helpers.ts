import type {
  ButtonAddPageAction,
  ButtonAutomationConfig,
  ButtonConfirmAction,
  ButtonEditAction,
} from '@blocksuite/affine-model';

import { listWorkspaceDatabases } from './executor.js';

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
    properties: {
      Name: { type: 'property', name: 'Name' },
    },
  };
}

export function createEmptyEditAction(): ButtonEditAction {
  return {
    type: 'edit',
    target: 'this_page',
    properties: {},
  };
}

export function cloneConfig(
  config: ButtonAutomationConfig
): ButtonAutomationConfig {
  return JSON.parse(JSON.stringify(config)) as ButtonAutomationConfig;
}
