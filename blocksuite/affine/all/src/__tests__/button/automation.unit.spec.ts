import {
  findSourceRowForDoc,
  findSourceRowForDocInDatabase,
  parseFormula,
} from '@blocksuite/affine-block-button';
import {
  DatabaseBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type { BaseTextAttributes } from '@blocksuite/store';
import { Text } from '@blocksuite/store';
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

  return { store, databaseId };
}

describe('button automation database utils', () => {
  test('findSourceRowForDocInDatabase resolves linked page row', () => {
    const idGenerator = createAutoIncrementIdGenerator();
    const workspace = new TestWorkspace({ id: 'ws', idGenerator });
    workspace.meta.initialize();

    createLinkedPageStore({
      workspace,
      pageDocId: 'page-1',
      pageTitle: 'Linked page',
    });
    const { databaseId } = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-doc',
      linkedDocId: 'page-1',
      linkedTitle: 'Linked page',
    });

    const found = findSourceRowForDocInDatabase(
      workspace,
      'page-1',
      'db-doc',
      databaseId
    );

    expect(found?.rowId).toBeTruthy();
  });

  test('findSourceRowForDoc uses configured source database only', () => {
    const idGenerator = createAutoIncrementIdGenerator();
    const workspace = new TestWorkspace({ id: 'ws-2', idGenerator });
    workspace.meta.initialize();

    createLinkedPageStore({
      workspace,
      pageDocId: 'page-a',
      pageTitle: 'Page A',
    });
    const first = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-1',
      linkedDocId: 'page-a',
      linkedTitle: 'Page A',
    });
    createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-2',
      linkedDocId: 'page-a',
      linkedTitle: 'Page A',
    });

    const found = findSourceRowForDoc(workspace, 'page-a', {
      databaseDocId: 'db-1',
      databaseBlockId: first.databaseId,
    });

    expect(found?.databaseDocId).toBe('db-1');
    expect(found?.databaseBlockId).toBe(first.databaseId);
    expect(found?.rowId).toBeTruthy();
  });
});

describe('button automation formula parser', () => {
  test('parses step result reference', () => {
    const parsed = parseFormula('Page added in step 2');
    expect(parsed).toEqual({ type: 'step_result', step: 2 });
  });

  test('parses this page property reference', () => {
    const parsed = parseFormula('This page.Status');
    expect(parsed).toEqual({
      type: 'property',
      name: 'Status',
    });
  });
});
