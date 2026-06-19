import {
  findSourceRowForDoc,
  findSourceRowForDocInDatabase,
  parseFormula,
} from '@blocksuite/affine-block-button';
import { getPlainTextFromText } from '@blocksuite/affine-block-database';
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

  return { store, databaseId, rowId };
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

  test('parses concat of this page and name', () => {
    const parsed = parseFormula('This page + This page.Name');
    expect(parsed).toEqual({
      type: 'concat',
      parts: [{ type: 'this_page' }, { type: 'property', name: 'Name' }],
    });
  });

  test('parses cyrillic property names', () => {
    expect(parseFormula('This page.Рубрика')).toEqual({
      type: 'property',
      name: 'Рубрика',
    });
    expect(parseFormula('This page.Название эпизода')).toEqual({
      type: 'property',
      name: 'Название эпизода',
    });
  });

  test('parses cyrillic property in if and concat', () => {
    expect(
      parseFormula(
        'if(empty(This page.Разработка), "Синхронизировать?", "Уже синхронизировано")'
      )
    ).toEqual({
      type: 'if_empty',
      value: { type: 'property', name: 'Разработка' },
      then: { type: 'literal', value: 'Синхронизировать?' },
      else: { type: 'literal', value: 'Уже синхронизировано' },
    });

    expect(
      parseFormula('This page.Название эпизода + " ENGLISH VERSION"')
    ).toEqual({
      type: 'concat',
      parts: [
        { type: 'property', name: 'Название эпизода' },
        { type: 'literal', value: ' ENGLISH VERSION' },
      ],
    });
  });

  test('parses Date triggered', () => {
    expect(parseFormula('Date triggered')).toEqual({
      type: 'date_triggered',
    });
  });

  test('parses dateRange with Date triggered and property', () => {
    expect(
      parseFormula('dateRange(Date triggered, This page.Дедлайн)')
    ).toEqual({
      type: 'date_range',
      start: { type: 'date_triggered' },
      end: { type: 'property', name: 'Дедлайн' },
    });
  });

  test('parses emoji Date triggered inside dateRange', () => {
    expect(
      parseFormula('dateRange(🗓️ Date triggered, This page.Дедлайн)')
    ).toEqual({
      type: 'date_range',
      start: { type: 'date_triggered' },
      end: { type: 'property', name: 'Дедлайн' },
    });
  });

  test('parses concat of step page references', () => {
    expect(parseFormula('Page added in step 2 + Page added in step 3')).toEqual(
      {
        type: 'concat',
        parts: [
          { type: 'step_result', step: 2 },
          { type: 'step_result', step: 3 },
        ],
      }
    );
  });
});

describe('button automation date values', () => {
  test('reads AFFiNE date column timestamp as date value', async () => {
    const { createPropertyResolver, evaluateExpression, setCellFromEvaluated } =
      await import('@blocksuite/affine-block-button');
    const { DatabaseBlockDataSource } =
      await import('@blocksuite/affine-block-database');
    const { propertyPresets } =
      await import('@blocksuite/data-view/property-presets');

    const idGenerator = createAutoIncrementIdGenerator();
    const workspace = new TestWorkspace({ id: 'ws-date', idGenerator });
    workspace.meta.initialize();

    createLinkedPageStore({
      workspace,
      pageDocId: 'page-date',
      pageTitle: 'Episode',
    });

    const source = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-source',
      linkedDocId: 'page-date',
      linkedTitle: 'Episode',
    });
    const target = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-target',
      linkedDocId: 'page-date',
      linkedTitle: 'Episode',
    });

    const sourceDataSource = new DatabaseBlockDataSource(
      source.store.getBlock(source.databaseId)!.model as never
    );
    const targetDataSource = new DatabaseBlockDataSource(
      target.store.getBlock(target.databaseId)!.model as never
    );

    const sourceDeadlineId = sourceDataSource.propertyAdd('end', {
      type: propertyPresets.datePropertyConfig.type,
      name: 'Дедлайн',
    });
    const targetPublicationId = targetDataSource.propertyAdd('end', {
      type: propertyPresets.datePropertyConfig.type,
      name: 'Публикация',
    });
    if (!sourceDeadlineId || !targetPublicationId) {
      throw new Error('date columns not created');
    }

    const deadline = Date.parse('2026-06-30T00:00:00.000Z');
    sourceDataSource.cellValueChange(source.rowId, sourceDeadlineId, deadline);

    const ctx = {
      host: {
        store: { id: 'page-date' },
        std: { workspace },
      },
      source: {
        databaseDocId: 'db-source',
        databaseBlockId: source.databaseId,
        rowId: source.rowId,
      },
      sourceDataSource,
      sourceDatabase: source.store.getBlock(source.databaseId)!.model,
      triggeredAt: new Date('2026-06-19T00:00:00.000Z'),
      stepResults: new Map(),
      currentDocId: 'page-date',
    };

    const evaluated = evaluateExpression(
      { type: 'property', name: 'Дедлайн' },
      ctx,
      createPropertyResolver()
    );

    expect(evaluated).toEqual({
      kind: 'date',
      start: deadline,
      end: null,
    });

    const targetRowId = target.store.addBlock(
      'affine:paragraph',
      {},
      target.databaseId
    );
    if (!targetRowId) throw new Error('target row not created');

    setCellFromEvaluated(
      targetRowId,
      targetPublicationId,
      targetDataSource,
      evaluated,
      {
        buildDocUrl: () => undefined,
      } as never,
      ctx.host
    );

    expect(
      targetDataSource.cellValueGet(targetRowId, targetPublicationId)
    ).toBe(deadline);
  });

  test('evaluates Date triggered and writes to date column', async () => {
    const { createPropertyResolver, evaluateExpression, setCellFromEvaluated } =
      await import('@blocksuite/affine-block-button');
    const { DatabaseBlockDataSource } =
      await import('@blocksuite/affine-block-database');
    const { propertyPresets } =
      await import('@blocksuite/data-view/property-presets');

    const idGenerator = createAutoIncrementIdGenerator();
    const workspace = new TestWorkspace({ id: 'ws-triggered', idGenerator });
    workspace.meta.initialize();

    createLinkedPageStore({
      workspace,
      pageDocId: 'page-triggered',
      pageTitle: 'Episode',
    });

    const source = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-triggered-source',
      linkedDocId: 'page-triggered',
      linkedTitle: 'Episode',
    });
    const target = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-triggered-target',
      linkedDocId: 'page-triggered',
      linkedTitle: 'Episode',
    });

    const sourceDataSource = new DatabaseBlockDataSource(
      source.store.getBlock(source.databaseId)!.model as never
    );
    const targetDataSource = new DatabaseBlockDataSource(
      target.store.getBlock(target.databaseId)!.model as never
    );

    const targetDateId = targetDataSource.propertyAdd('end', {
      type: propertyPresets.datePropertyConfig.type,
      name: 'Срок',
    });
    if (!targetDateId) throw new Error('date column not created');

    const triggeredAt = new Date('2026-06-19T12:00:00.000Z');
    const ctx = {
      host: {
        store: { id: 'page-triggered' },
        std: { workspace },
      },
      source: {
        databaseDocId: 'db-triggered-source',
        databaseBlockId: source.databaseId,
        rowId: source.rowId,
      },
      sourceDataSource,
      sourceDatabase: source.store.getBlock(source.databaseId)!.model,
      triggeredAt,
      stepResults: new Map(),
      currentDocId: 'page-triggered',
    };

    const evaluated = evaluateExpression(
      { type: 'date_triggered' },
      ctx,
      createPropertyResolver()
    );

    expect(evaluated).toEqual({
      kind: 'date',
      start: triggeredAt.getTime(),
      end: null,
    });

    const targetRowId = target.store.addBlock(
      'affine:paragraph',
      {},
      target.databaseId
    );
    if (!targetRowId) throw new Error('target row not created');

    setCellFromEvaluated(
      targetRowId,
      targetDateId,
      targetDataSource,
      evaluated,
      { buildDocUrl: () => undefined } as never,
      ctx.host
    );

    expect(targetDataSource.cellValueGet(targetRowId, targetDateId)).toBe(
      triggeredAt.getTime()
    );
  });

  test('evaluates dateRange and writes end date to date column', async () => {
    const { createPropertyResolver, evaluateExpression, setCellFromEvaluated } =
      await import('@blocksuite/affine-block-button');
    const { DatabaseBlockDataSource } =
      await import('@blocksuite/affine-block-database');
    const { propertyPresets } =
      await import('@blocksuite/data-view/property-presets');

    const idGenerator = createAutoIncrementIdGenerator();
    const workspace = new TestWorkspace({ id: 'ws-range', idGenerator });
    workspace.meta.initialize();

    createLinkedPageStore({
      workspace,
      pageDocId: 'page-range',
      pageTitle: 'Episode',
    });

    const source = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-range-source',
      linkedDocId: 'page-range',
      linkedTitle: 'Episode',
    });
    const target = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-range-target',
      linkedDocId: 'page-range',
      linkedTitle: 'Episode',
    });

    const sourceDataSource = new DatabaseBlockDataSource(
      source.store.getBlock(source.databaseId)!.model as never
    );
    const targetDataSource = new DatabaseBlockDataSource(
      target.store.getBlock(target.databaseId)!.model as never
    );

    const sourceDeadlineId = sourceDataSource.propertyAdd('end', {
      type: propertyPresets.datePropertyConfig.type,
      name: 'Дедлайн',
    });
    const targetDateId = targetDataSource.propertyAdd('end', {
      type: propertyPresets.datePropertyConfig.type,
      name: 'Срок',
    });
    if (!sourceDeadlineId || !targetDateId) {
      throw new Error('date columns not created');
    }

    const triggeredAt = new Date('2026-06-19T00:00:00.000Z');
    const deadline = Date.parse('2026-06-30T00:00:00.000Z');
    sourceDataSource.cellValueChange(source.rowId, sourceDeadlineId, deadline);

    const ctx = {
      host: {
        store: { id: 'page-range' },
        std: { workspace },
      },
      source: {
        databaseDocId: 'db-range-source',
        databaseBlockId: source.databaseId,
        rowId: source.rowId,
      },
      sourceDataSource,
      sourceDatabase: source.store.getBlock(source.databaseId)!.model,
      triggeredAt,
      stepResults: new Map(),
      currentDocId: 'page-range',
    };

    const evaluated = evaluateExpression(
      {
        type: 'date_range',
        start: { type: 'date_triggered' },
        end: { type: 'property', name: 'Дедлайн' },
      },
      ctx,
      createPropertyResolver()
    );

    expect(evaluated).toEqual({
      kind: 'date',
      start: triggeredAt.getTime(),
      end: deadline,
    });

    const targetRowId = target.store.addBlock(
      'affine:paragraph',
      {},
      target.databaseId
    );
    if (!targetRowId) throw new Error('target row not created');

    setCellFromEvaluated(
      targetRowId,
      targetDateId,
      targetDataSource,
      evaluated,
      { buildDocUrl: () => undefined } as never,
      ctx.host
    );

    expect(targetDataSource.cellValueGet(targetRowId, targetDateId)).toBe(
      deadline
    );
  });

  test('evaluates concat of step page references as linked docs', async () => {
    const { createPropertyResolver, evaluateExpression, setCellFromEvaluated } =
      await import('@blocksuite/affine-block-button');
    const { DatabaseBlockDataSource, databaseBlockProperties } =
      await import('@blocksuite/affine-block-database');

    const idGenerator = createAutoIncrementIdGenerator();
    const workspace = new TestWorkspace({ id: 'ws-step', idGenerator });
    workspace.meta.initialize();

    createLinkedPageStore({
      workspace,
      pageDocId: 'page-step',
      pageTitle: 'Episode',
    });
    createLinkedPageStore({
      workspace,
      pageDocId: 'dev-page-1',
      pageTitle: 'Dev 1',
    });
    createLinkedPageStore({
      workspace,
      pageDocId: 'dev-page-2',
      pageTitle: 'Dev 2',
    });

    const source = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-step-source',
      linkedDocId: 'page-step',
      linkedTitle: 'Episode',
    });
    const devDb = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-step-dev',
      linkedDocId: 'dev-page-1',
      linkedTitle: 'Dev 1',
    });

    const sourceDataSource = new DatabaseBlockDataSource(
      source.store.getBlock(source.databaseId)!.model as never
    );
    const relationId = sourceDataSource.propertyAdd('end', {
      type: databaseBlockProperties.richTextColumnConfig.type,
      name: 'Разработка',
    });
    if (!relationId) throw new Error('relation column not created');

    const devRow2 = devDb.store.addBlock(
      'affine:paragraph',
      {},
      devDb.databaseId
    );
    if (!devRow2) throw new Error('dev row 2 not created');
    const devRow2Model = devDb.store.getBlock(devRow2)?.model;
    devRow2Model?.text?.insert(REFERENCE_NODE, 0, {
      reference: { type: 'LinkedPage', pageId: 'dev-page-2' },
    } satisfies AffineTextAttributes as BaseTextAttributes);

    const ctx = {
      host: {
        store: { id: 'page-step' },
        std: { workspace },
      },
      source: {
        databaseDocId: 'db-step-source',
        databaseBlockId: source.databaseId,
        rowId: source.rowId,
      },
      sourceDataSource,
      sourceDatabase: source.store.getBlock(source.databaseId)!.model,
      triggeredAt: new Date('2026-06-19T00:00:00.000Z'),
      stepResults: new Map([
        [
          2,
          {
            rowId: devDb.rowId,
            docId: 'dev-page-1',
            databaseDocId: 'db-step-dev',
            databaseBlockId: devDb.databaseId,
          },
        ],
        [
          3,
          {
            rowId: devRow2,
            docId: 'dev-page-2',
            databaseDocId: 'db-step-dev',
            databaseBlockId: devDb.databaseId,
          },
        ],
      ]),
      currentDocId: 'page-step',
    };

    const evaluated = evaluateExpression(
      {
        type: 'concat',
        parts: [
          { type: 'step_result', step: 2 },
          { type: 'step_result', step: 3 },
        ],
      },
      ctx,
      createPropertyResolver()
    );

    expect(evaluated).toEqual({
      kind: 'linked_docs',
      docIds: ['dev-page-1', 'dev-page-2'],
    });

    setCellFromEvaluated(
      source.rowId,
      relationId,
      sourceDataSource,
      evaluated,
      { buildDocUrl: () => undefined } as never,
      ctx.host
    );

    const cellValue = sourceDataSource.cellValueGet(source.rowId, relationId);
    expect(cellValue).toBeInstanceOf(Text);
    const docIds = (cellValue as Text).deltas$.value
      .filter(
        (delta: { attributes?: { reference?: { pageId?: string } } }) =>
          delta.attributes?.reference?.pageId
      )
      .map(
        (delta: { attributes?: { reference?: { pageId?: string } } }) =>
          delta.attributes!.reference!.pageId
      );
    expect(docIds).toEqual(['dev-page-1', 'dev-page-2']);
  });
});

describe('button automation title plain text', () => {
  test('getPlainTextFromText resolves linked page title as plain text', () => {
    const idGenerator = createAutoIncrementIdGenerator();
    const workspace = new TestWorkspace({ id: 'ws-title', idGenerator });
    workspace.meta.initialize();

    createLinkedPageStore({
      workspace,
      pageDocId: 'page-title',
      pageTitle: 'Даю мультяшным котам покушать',
    });
    const { store, rowId } = createDatabaseWithLinkedPage({
      workspace,
      databaseDocId: 'db-title',
      linkedDocId: 'page-title',
      linkedTitle: 'Даю мультяшным котам покушать',
    });

    const rowText = store.getBlock(rowId)?.model?.text;
    rowText?.clear();
    rowText?.insert(REFERENCE_NODE, 0, {
      reference: {
        type: 'LinkedPage',
        pageId: 'page-title',
      },
    } satisfies AffineTextAttributes as BaseTextAttributes);

    expect(
      getPlainTextFromText(
        rowText,
        docId => workspace.getDoc(docId)?.meta?.title
      )
    ).toBe('Даю мультяшным котам покушать');
  });
});
