import { getSingleDocIdFromText } from '@blocksuite/affine-block-database';
import type {
  ButtonAction,
  ButtonAutomationConfig,
  ButtonBlockModel,
  ButtonConfirmAction,
} from '@blocksuite/affine-model';
import type { EditorHost } from '@blocksuite/std';

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

export {
  createDataSourceForDatabase,
  findDatabaseInWorkspace,
  findSourceRowForDoc,
  findSourceRowForDocInDatabase,
  listWorkspaceDatabases,
  resolveRowForDocInWorkspace,
} from './database-utils.js';

export type ExecuteAutomationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'cancelled' | 'no_source' | 'error';
      message?: string;
    };

type ActionResult =
  | { status: 'continue' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

function formatError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

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
  try {
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
      const dbName = automation.sourceDatabase?.databaseName?.trim();
      return {
        ok: false,
        reason: 'no_source',
        message: dbName
          ? `This page is not linked to database «${dbName}»`
          : 'Could not resolve database row for this page',
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
      if (result.status === 'cancelled') {
        return { ok: false, reason: 'cancelled' };
      }
      if (result.status === 'error') {
        return {
          ok: false,
          reason: 'error',
          message: `Step ${stepIndex}: ${result.message}`,
        };
      }
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: formatError(error),
    };
  }
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
): Promise<ActionResult> {
  switch (action.type) {
    case 'confirm': {
      const message = buildConfirmMessage(action, ctx, resolver);
      const { confirmed } = await provider.showConfirm({
        host: ctx.host,
        message,
        continueText: action.continueText,
        cancelText: action.cancelText,
      });
      return confirmed ? { status: 'continue' } : { status: 'cancelled' };
    }
    case 'add_page':
      return executeAddPage(action, ctx, provider, resolver, stepIndex);
    case 'edit':
      return executeEdit(action, ctx, provider, resolver);
    default:
      return { status: 'error', message: 'Unknown action type' };
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
): Promise<ActionResult> {
  if (!action.databaseDocId || !action.databaseBlockId) {
    return {
      status: 'error',
      message: 'Target database is not selected',
    };
  }

  const target = await provider.resolveDatabaseTarget({
    host: ctx.host,
    databaseDocId: action.databaseDocId,
    databaseBlockId: action.databaseBlockId,
  });
  if (!target) {
    const dbLabel = action.databaseName?.trim() || 'selected database';
    return {
      status: 'error',
      message: `Target database «${dbLabel}» not found`,
    };
  }

  target.database.store.captureSync();
  const rowId = target.dataSource.rowAdd('end');
  if (!rowId) {
    return { status: 'error', message: 'Failed to add row to target database' };
  }

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
  return { status: 'continue' };
}

async function executeEdit(
  action: Extract<ButtonAction, { type: 'edit' }>,
  ctx: AutomationRuntimeContext,
  provider: ButtonAutomationContextProvider,
  resolver: ReturnType<typeof createPropertyResolver>
): Promise<ActionResult> {
  if (!Object.keys(action.properties).length) {
    return { status: 'error', message: 'No properties configured to edit' };
  }

  for (const [propertyName, expr] of Object.entries(action.properties)) {
    const propertyId =
      propertyName === 'Name' || propertyName === 'title'
        ? 'title'
        : resolver.getPropertyIdByName(ctx.sourceDataSource, propertyName);
    if (!propertyId) {
      return {
        status: 'error',
        message: `Property «${propertyName}» not found in source database`,
      };
    }
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
  return { status: 'continue' };
}
