import {
  buildCreateFoldersRequest,
  createEmptyCreateGoogleDriveFoldersAction,
  createPropertyResolver,
  executeCreateGoogleDriveFoldersAction,
  extractFolderUrlFromResponse,
} from '@blocksuite/affine-block-button';
import { DatabaseBlockDataSource } from '@blocksuite/affine-block-database';
import {
  DatabaseBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { propertyPresets } from '@blocksuite/data-view/property-presets';
import type { BaseTextAttributes } from '@blocksuite/store';
import { nanoid, Text } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { describe, expect, test } from 'vitest';

const extensions = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
];

function createLinkedPageStore(input: {
  workspace: TestWorkspace;
  pageDocId: string;
  pageTitle: string;
}) {
  const doc = input.workspace.createDoc(input.pageDocId);
  doc.load();
  const store = doc.getStore({ id: input.pageDocId, extensions });
  const rootId = store.addBlock('affine:page', {
    title: new Text(input.pageTitle),
  });
  store.addBlock('affine:note', {}, rootId);
  return store;
}

function createDatabaseWithLinkedPage(input: {
  workspace: TestWorkspace;
  databaseDocId: string;
  linkedDocId: string;
  linkedTitle: string;
}) {
  const dbDoc = input.workspace.createDoc(input.databaseDocId);
  dbDoc.load();
  const store = dbDoc.getStore({ id: input.databaseDocId, extensions });
  const rootId = store.addBlock('affine:page', { title: new Text('DB doc') });
  const noteId = store.addBlock('affine:note', {}, rootId);
  const databaseId = store.addBlock(
    'affine:database',
    {
      columns: [],
      cells: {},
      titleColumn: 'title',
    },
    noteId
  );
  const database = store.getBlock(databaseId)?.model;
  if (!database) throw new Error('database not created');

  const rowId = store.addBlock('affine:paragraph', {}, databaseId);
  const row = store.getBlock(rowId)?.model;
  if (!row?.text) throw new Error('row not created');

  row.text.insert(REFERENCE_NODE, 0, {
    reference: {
      type: 'LinkedPage',
      pageId: input.linkedDocId,
    },
  } satisfies AffineTextAttributes as BaseTextAttributes);
  row.text.insert(` ${input.linkedTitle}`, 1);

  return { store, databaseId, rowId };
}

describe('google drive folders action', () => {
  test('buildCreateFoldersRequest resolves episode and category', () => {
    const idGenerator = createAutoIncrementIdGenerator();
    const workspace = new TestWorkspace({ id: 'ws-gd', idGenerator });
    workspace.meta.initialize();

    createLinkedPageStore({
      workspace,
      pageDocId: 'page-gd',
      pageTitle: 'Episode 42',
    });

    const source = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-gd',
      linkedDocId: 'page-gd',
      linkedTitle: 'Episode 42',
    });

    const sourceDataSource = new DatabaseBlockDataSource(
      source.store.getBlock(source.databaseId)!.model as never
    );

    const rubricId = sourceDataSource.propertyAdd('end', {
      type: propertyPresets.selectPropertyConfig.type,
      name: 'Рубрика',
    });
    if (!rubricId) throw new Error('rubric column not created');
    const optionId = nanoid();
    sourceDataSource.propertyDataSet(rubricId, {
      options: [{ id: optionId, value: 'История', color: 'blue' }],
    });
    sourceDataSource.cellValueChange(source.rowId, rubricId, optionId);

    const ctx = {
      host: {
        store: { id: 'page-gd' },
        std: { workspace },
      },
      source: {
        databaseDocId: 'db-gd',
        databaseBlockId: source.databaseId,
        rowId: source.rowId,
      },
      sourceDataSource,
      sourceDatabase: source.store.getBlock(source.databaseId)!.model,
      triggeredAt: new Date('2026-06-19T00:00:00.000Z'),
      stepResults: new Map(),
      currentDocId: 'page-gd',
    };

    const action = createEmptyCreateGoogleDriveFoldersAction();
    action.categoryName = { type: 'property', name: 'Рубрика' };

    const request = buildCreateFoldersRequest(
      action,
      ctx,
      createPropertyResolver()
    );

    expect(request).toEqual({
      categoryName: 'История',
      episodeTitle: 'Episode 42',
    });
  });

  test('extractFolderUrlFromResponse reads episode folder url', () => {
    expect(
      extractFolderUrlFromResponse({
        status: 'success',
        episodeFolderUrl: 'https://drive.google.com/drive/folders/abc',
      })
    ).toBe('https://drive.google.com/drive/folders/abc');
  });

  test('executeCreateGoogleDriveFoldersAction writes link to target column', async () => {
    const idGenerator = createAutoIncrementIdGenerator();
    const workspace = new TestWorkspace({ id: 'ws-gd-write', idGenerator });
    workspace.meta.initialize();

    createLinkedPageStore({
      workspace,
      pageDocId: 'page-gd-write',
      pageTitle: 'Episode 7',
    });

    const source = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-gd-write',
      linkedDocId: 'page-gd-write',
      linkedTitle: 'Episode 7',
    });

    const sourceDataSource = new DatabaseBlockDataSource(
      source.store.getBlock(source.databaseId)!.model as never
    );

    const driveLinkId = sourceDataSource.propertyAdd('end', {
      type: 'link',
      name: 'Google Drive',
    });
    if (!driveLinkId) throw new Error('link column not created');

    const ctx = {
      host: {
        store: { id: 'page-gd-write' },
        std: { workspace },
      },
      source: {
        databaseDocId: 'db-gd-write',
        databaseBlockId: source.databaseId,
        rowId: source.rowId,
      },
      sourceDataSource,
      sourceDatabase: source.store.getBlock(source.databaseId)!.model,
      triggeredAt: new Date('2026-06-19T00:00:00.000Z'),
      stepResults: new Map(),
      currentDocId: 'page-gd-write',
    };

    const folderUrl = 'https://drive.google.com/drive/folders/test-folder';
    const action = createEmptyCreateGoogleDriveFoldersAction();
    action.categoryName = { type: 'literal', value: 'История' };

    const result = await executeCreateGoogleDriveFoldersAction({
      action,
      ctx,
      provider: {
        buildDocUrl: () => undefined,
        googleDrive: {
          ensureAuthorized: async () => ({ ok: true }),
          createFolders: async () => ({
            ok: true,
            data: {
              status: 'success',
              episodeFolderUrl: folderUrl,
            },
          }),
        },
      } as never,
    });

    expect(result).toEqual({ ok: true });
    expect(sourceDataSource.cellValueGet(source.rowId, driveLinkId)).toBe(
      folderUrl
    );
  });
});
