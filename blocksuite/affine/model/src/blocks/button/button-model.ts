import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

import type { BlockMeta } from '../../utils/types.js';

export type ButtonValueExpression =
  | { type: 'this_page' }
  | { type: 'date_triggered' }
  | { type: 'step_result'; step: number }
  | { type: 'property'; name: string }
  | { type: 'property_of'; base: ButtonValueExpression; name: string }
  | { type: 'literal'; value: string }
  | { type: 'concat'; parts: ButtonValueExpression[] }
  | {
      type: 'if_empty';
      value: ButtonValueExpression;
      then: ButtonValueExpression;
      else: ButtonValueExpression;
    }
  | {
      type: 'if';
      condition: ButtonValueExpression;
      then: ButtonValueExpression;
      else: ButtonValueExpression;
    }
  | { type: 'empty'; value: ButtonValueExpression }
  | { type: 'not_empty'; value: ButtonValueExpression }
  | {
      type: 'date_range';
      start: ButtonValueExpression;
      end: ButtonValueExpression;
    }
  | { type: 'not_empty_marker'; value: ButtonValueExpression; marker: string }
  | { type: 'formula'; source: string };

export type ButtonConfirmAction = {
  type: 'confirm';
  message: ButtonValueExpression;
  continueText: string;
  cancelText: string;
};

export type ButtonAddPageAction = {
  type: 'add_page';
  databaseDocId: string;
  databaseBlockId: string;
  databaseName?: string;
  template: 'empty';
  properties: Record<string, ButtonValueExpression>;
};

export type ButtonEditAction = {
  type: 'edit';
  target: 'this_page';
  properties: Record<string, ButtonValueExpression>;
};

export type ButtonColorCharactersAction = {
  type: 'color_characters';
};

export type GoogleDriveFoldersUrlField =
  | 'episodeFolderUrl'
  | 'categoryFolderUrl';

export type ButtonCreateGoogleDriveFoldersAction = {
  type: 'create_google_drive_folders';
  episodeTitle: ButtonValueExpression;
  categoryName: ButtonValueExpression;
  parentFolderId?: ButtonValueExpression;
  targetProperty: string;
  resultUrlField?: GoogleDriveFoldersUrlField;
};

export type ButtonAction =
  | ButtonConfirmAction
  | ButtonAddPageAction
  | ButtonEditAction
  | ButtonColorCharactersAction
  | ButtonCreateGoogleDriveFoldersAction;

export type ButtonSourceDatabase = {
  databaseDocId: string;
  databaseBlockId: string;
  databaseName?: string;
};

export type ButtonSourceContext = {
  databaseDocId: string;
  databaseBlockId: string;
  rowId: string;
};

export type ButtonAutomationConfig = {
  label: string;
  sourceDatabase?: ButtonSourceDatabase;
  source?: ButtonSourceContext;
  actions: ButtonAction[];
};

export type ButtonBlockProps = {
  automation: ButtonAutomationConfig;
} & BlockMeta;

export const defaultButtonAutomation = (): ButtonAutomationConfig => ({
  label: 'Button',
  actions: [],
});

export const ButtonBlockSchema = defineBlockSchema({
  flavour: 'affine:button',
  props: (_internal): ButtonBlockProps => ({
    automation: defaultButtonAutomation(),
    'meta:createdAt': undefined,
    'meta:updatedAt': undefined,
    'meta:createdBy': undefined,
    'meta:updatedBy': undefined,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: [
      'affine:note',
      'affine:database',
      'affine:paragraph',
      'affine:list',
      'affine:callout',
    ],
    children: [],
  },
  toModel: () => new ButtonBlockModel(),
});

export class ButtonBlockModel extends BlockModel<ButtonBlockProps> {}

export const ButtonBlockSchemaExtension =
  BlockSchemaExtension(ButtonBlockSchema);
