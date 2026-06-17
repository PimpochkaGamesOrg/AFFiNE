import type { DatabaseBlockDataSource } from '@blocksuite/affine-block-database';
import type {
  ButtonSourceContext,
  DatabaseBlockModel,
} from '@blocksuite/affine-model';
import type { EditorHost } from '@blocksuite/std';
import type { Text } from '@blocksuite/store';

export type StepResult = {
  rowId: string;
  docId?: string;
  databaseDocId: string;
  databaseBlockId: string;
};

export type AutomationRuntimeContext = {
  host: EditorHost;
  source: ButtonSourceContext;
  sourceDataSource: DatabaseBlockDataSource;
  sourceDatabase: DatabaseBlockModel;
  triggeredAt: Date;
  stepResults: Map<number, StepResult>;
  currentDocId: string;
};

export type EvaluatedValue =
  | { kind: 'text'; value: string }
  | { kind: 'linked_doc'; docId: string; title?: string }
  | { kind: 'linked_docs'; docIds: string[] }
  | { kind: 'date'; start: number; end?: number | null }
  | { kind: 'select'; optionId: string }
  | { kind: 'multi_select'; optionIds: string[] }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'empty' }
  | { kind: 'unknown'; value: unknown };

export type DatabaseTarget = {
  databaseDocId: string;
  databaseBlockId: string;
  dataSource: DatabaseBlockDataSource;
  database: DatabaseBlockModel;
};

export type ConfirmResult = {
  confirmed: boolean;
};

export type ButtonAutomationContextProvider = {
  resolveSourceContext: (input: {
    host: EditorHost;
    currentDocId: string;
    storedSource?: ButtonSourceContext;
  }) => Promise<ButtonSourceContext | undefined>;
  resolveDatabaseTarget: (input: {
    host: EditorHost;
    databaseDocId: string;
    databaseBlockId: string;
  }) => Promise<DatabaseTarget | undefined>;
  findDatabaseByName: (input: {
    host: EditorHost;
    name: string;
  }) => Promise<DatabaseTarget | undefined>;
  buildDocUrl: (docId: string, host: EditorHost) => string | undefined;
  showConfirm: (input: {
    host: EditorHost;
    message: string;
    continueText: string;
    cancelText: string;
  }) => Promise<ConfirmResult>;
};

export const ButtonAutomationContextProviderIdentifier =
  'ButtonAutomationContextProvider' as const;

export type PropertyResolver = {
  getPropertyIdByName: (
    dataSource: DatabaseBlockDataSource,
    name: string
  ) => string | undefined;
  getPropertyType: (
    dataSource: DatabaseBlockDataSource,
    propertyId: string
  ) => string | undefined;
  getCellValue: (
    dataSource: DatabaseBlockDataSource,
    rowId: string,
    propertyId: string
  ) => unknown;
  getRowTitleText: (
    rowId: string,
    dataSource: DatabaseBlockDataSource
  ) => Text | undefined;
  getRowLinkedDocId: (
    rowId: string,
    dataSource: DatabaseBlockDataSource
  ) => string | undefined;
};
