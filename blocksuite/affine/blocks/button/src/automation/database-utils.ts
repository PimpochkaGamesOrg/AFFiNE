import {
  DatabaseBlockDataSource,
  getSingleDocIdFromText,
} from '@blocksuite/affine-block-database';
import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import type { EditorHost } from '@blocksuite/std';
import type { Workspace } from '@blocksuite/store';

import type { DatabaseTarget } from './types.js';

export function findDatabaseInWorkspace(
  workspace: Workspace,
  databaseDocId: string,
  databaseBlockId: string
): DatabaseBlockModel | undefined {
  const doc = workspace.getDoc(databaseDocId);
  if (!doc) return undefined;
  const store = doc.getStore({ id: databaseDocId });
  if (!store.ready) store.load();
  const block = store.getBlock(databaseBlockId);
  if (!block || block.flavour !== 'affine:database') return undefined;
  return block.model as DatabaseBlockModel;
}

export function listWorkspaceDatabases(input: { workspace: Workspace }) {
  const result: {
    databaseDocId: string;
    databaseBlockId: string;
    name: string;
  }[] = [];
  for (const docId of input.workspace.docs.keys()) {
    const doc = input.workspace.getDoc(docId);
    if (!doc) continue;
    const store = doc.getStore({ id: docId });
    if (!store.ready) store.load();
    store.getAllModels().forEach(model => {
      if (model.flavour === 'affine:database') {
        result.push({
          databaseDocId: docId,
          databaseBlockId: model.id,
          name: model.props.title?.toString?.() ?? 'Untitled',
        });
      }
    });
  }
  return result;
}

export function findSourceRowForDocInDatabase(
  workspace: Workspace,
  docId: string,
  databaseDocId: string,
  databaseBlockId: string
): { rowId: string } | undefined {
  const database = findDatabaseInWorkspace(
    workspace,
    databaseDocId,
    databaseBlockId
  );
  if (!database) return undefined;
  const dataSource = new DatabaseBlockDataSource(database);
  for (const rowId of dataSource.rows$.value) {
    const linked = getSingleDocIdFromText(
      dataSource.doc.getBlock(rowId)?.model?.text
    );
    if (linked === docId) {
      return { rowId };
    }
  }
  return undefined;
}

export function findSourceRowForDoc(
  workspace: Workspace,
  docId: string,
  sourceDatabase?: {
    databaseDocId: string;
    databaseBlockId: string;
  }
):
  | {
      databaseDocId: string;
      databaseBlockId: string;
      rowId: string;
    }
  | undefined {
  if (sourceDatabase?.databaseDocId && sourceDatabase?.databaseBlockId) {
    const row = findSourceRowForDocInDatabase(
      workspace,
      docId,
      sourceDatabase.databaseDocId,
      sourceDatabase.databaseBlockId
    );
    if (!row) return undefined;
    return {
      databaseDocId: sourceDatabase.databaseDocId,
      databaseBlockId: sourceDatabase.databaseBlockId,
      rowId: row.rowId,
    };
  }
  for (const item of listWorkspaceDatabases({ workspace })) {
    const database = findDatabaseInWorkspace(
      workspace,
      item.databaseDocId,
      item.databaseBlockId
    );
    if (!database) continue;
    const dataSource = new DatabaseBlockDataSource(database);
    for (const rowId of dataSource.rows$.value) {
      const linked = getSingleDocIdFromText(
        dataSource.doc.getBlock(rowId)?.model?.text
      );
      if (linked === docId) {
        return {
          databaseDocId: item.databaseDocId,
          databaseBlockId: item.databaseBlockId,
          rowId,
        };
      }
    }
  }
  return undefined;
}

export function createDataSourceForDatabase(
  host: EditorHost,
  databaseDocId: string,
  databaseBlockId: string
): DatabaseBlockDataSource | undefined {
  const database = findDatabaseInWorkspace(
    host.store.workspace,
    databaseDocId,
    databaseBlockId
  );
  if (!database) return undefined;
  return new DatabaseBlockDataSource(database, ds => {
    ds.serviceSet('EditorHostKey' as never, host);
  });
}

export function resolveRowForDocInWorkspace(
  host: EditorHost,
  docId: string
): (DatabaseTarget & { rowId: string }) | undefined {
  const found = findSourceRowForDoc(host.store.workspace, docId);
  if (!found) return undefined;
  const database = findDatabaseInWorkspace(
    host.store.workspace,
    found.databaseDocId,
    found.databaseBlockId
  );
  if (!database) return undefined;
  const dataSource = new DatabaseBlockDataSource(database, ds => {
    ds.serviceSet('EditorHostKey' as never, host);
  });
  return {
    databaseDocId: found.databaseDocId,
    databaseBlockId: found.databaseBlockId,
    database,
    dataSource,
    rowId: found.rowId,
  };
}
