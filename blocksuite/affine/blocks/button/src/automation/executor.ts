import {
  DatabaseBlockDataSource,
  getSingleDocIdFromText,
} from '@blocksuite/affine-block-database';
import type {
  ButtonAction,
  ButtonAutomationConfig,
  ButtonBlockModel,
  ButtonConfirmAction,
  ButtonSourceContext,
  DatabaseBlockModel,
} from '@blocksuite/affine-model';
import type { EditorHost } from '@blocksuite/std';
import type { Workspace } from '@blocksuite/store';

import {
  createPropertyResolver,
  createRuntimeContext,
  evaluateExpression,
  evaluateExpressionAsString,
  resolveSourceContext,
  setCellFromEvaluated,
} from './expression.js';
import type {
  AutomationRuntimeContext,
  ButtonAutomationContextProvider,
  StepResult,
} from './types.js';

export type ExecuteAutomationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'cancelled' | 'no_source' | 'error';
      message?: string;
    };

export async function executeButtonAutomationConfig(
  automation: ButtonAutomationConfig,
  host: EditorHost,
  provider: ButtonAutomationContextProvider,
  options?: {
    onSourceResolved?: (
      config: ButtonAutomationConfig,
      source: ButtonSourceContext
    ) => void;
  }
): Promise<ExecuteAutomationResult> {
  if (!automation.actions.length) {
    return { ok: false, reason: 'error', message: 'No actions configured' };
  }

  const source = await resolveSourceContext(
    provider,
    host,
    automation.source,
    automation.sourceDatabase
  );
  if (!source) {
    return {
      ok: false,
      reason: 'no_source',
      message: 'Could not resolve database row for this page',
    };
  }

  if (!automation.source) {
    options?.onSourceResolved?.({ ...automation, source }, source);
  }

  const ctx = createRuntimeContext({ host, source });
  const resolver = createPropertyResolver();

  for (let index = 0; index < automation.actions.length; index++) {
    const action = automation.actions[index];
    const stepIndex = index + 1;
    const result = await executeAction(
      action,
      ctx,
      provider,
      resolver,
      stepIndex
    );
    if (result === 'cancelled') {
      return { ok: false, reason: 'cancelled' };
    }
    if (result === 'error') {
      return { ok: false, reason: 'error' };
    }
  }

  return { ok: true };
}

export async function executeButtonAutomation(
  model: ButtonBlockModel,
  host: EditorHost,
  provider: ButtonAutomationContextProvider
): Promise<ExecuteAutomationResult> {
  return executeButtonAutomationConfig(model.props.automation, host, provider, {
    onSourceResolved: config => {
      if (model.props.automation.source) return;
      model.store.transact(() => {
        model.props.automation = config;
      });
    },
  });
}

async function executeAction(
  action: ButtonAction,
  ctx: AutomationRuntimeContext,
  provider: ButtonAutomationContextProvider,
  resolver: ReturnType<typeof createPropertyResolver>,
  stepIndex: number
): Promise<'continue' | 'cancelled' | 'error'> {
  switch (action.type) {
    case 'confirm': {
      const message = buildConfirmMessage(action, ctx, resolver);
      const { confirmed } = await provider.showConfirm({
        host: ctx.host,
        message,
        continueText: action.continueText,
        cancelText: action.cancelText,
      });
      return confirmed ? 'continue' : 'cancelled';
    }
    case 'add_page':
      return executeAddPage(action, ctx, provider, resolver, stepIndex);
    case 'edit':
      return executeEdit(action, ctx, provider, resolver);
    default:
      return 'error';
  }
}

function buildConfirmMessage(
  action: ButtonConfirmAction,
  ctx: AutomationRuntimeContext,
  resolver: ReturnType<typeof createPropertyResolver>
): string {
  return evaluateExpressionAsString(action.message, ctx, resolver);
}

async function executeAddPage(
  action: Extract<ButtonAction, { type: 'add_page' }>,
  ctx: AutomationRuntimeContext,
  provider: ButtonAutomationContextProvider,
  resolver: ReturnType<typeof createPropertyResolver>,
  stepIndex: number
): Promise<'continue' | 'error'> {
  const target = await provider.resolveDatabaseTarget({
    host: ctx.host,
    databaseDocId: action.databaseDocId,
    databaseBlockId: action.databaseBlockId,
  });
  if (!target) return 'error';

  target.database.store.captureSync();
  const rowId = target.dataSource.rowAdd('end');
  if (!rowId) return 'error';

  for (const [propertyName, expr] of Object.entries(action.properties)) {
    const propertyId =
      propertyName === 'Name' || propertyName === 'title'
        ? 'title'
        : resolver.getPropertyIdByName(target.dataSource, propertyName);
    if (!propertyId) continue;
    const evaluated = evaluateExpression(expr, ctx, resolver);
    setCellFromEvaluated(
      rowId,
      propertyId,
      target.dataSource,
      evaluated,
      provider,
      ctx.host
    );
  }

  const linkedDocId = getSingleDocIdFromText(
    target.dataSource.doc.getBlock(rowId)?.model?.text
  );

  const stepResult: StepResult = {
    rowId,
    docId: linkedDocId,
    databaseDocId: action.databaseDocId,
    databaseBlockId: action.databaseBlockId,
  };
  ctx.stepResults.set(stepIndex, stepResult);
  return 'continue';
}

async function executeEdit(
  action: Extract<ButtonAction, { type: 'edit' }>,
  ctx: AutomationRuntimeContext,
  provider: ButtonAutomationContextProvider,
  resolver: ReturnType<typeof createPropertyResolver>
): Promise<'continue' | 'error'> {
  for (const [propertyName, expr] of Object.entries(action.properties)) {
    const propertyId =
      propertyName === 'Name' || propertyName === 'title'
        ? 'title'
        : resolver.getPropertyIdByName(ctx.sourceDataSource, propertyName);
    if (!propertyId) continue;
    const evaluated = evaluateExpression(expr, ctx, resolver);
    setCellFromEvaluated(
      ctx.source.rowId,
      propertyId,
      ctx.sourceDataSource,
      evaluated,
      provider,
      ctx.host
    );
  }
  return 'continue';
}

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
