import {
  type DatabaseBlockDataSource,
  getPlainTextFromText,
  getSingleDocIdFromText,
} from '@blocksuite/affine-block-database';
import type {
  ButtonSourceContext,
  ButtonValueExpression,
  DatabaseBlockModel,
} from '@blocksuite/affine-model';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type { EditorHost } from '@blocksuite/std';
import {
  type BaseTextAttributes,
  type DeltaInsert,
  Text,
} from '@blocksuite/store';

function createLinkedDocCellText(docIds: string[]): Text {
  const deltas: DeltaInsert<BaseTextAttributes>[] = [];
  docIds.forEach((docId, index) => {
    if (index > 0) {
      deltas.push({ insert: ' ' });
    }
    deltas.push({
      insert: REFERENCE_NODE,
      attributes: {
        reference: { type: 'LinkedPage', pageId: docId },
      } satisfies AffineTextAttributes as BaseTextAttributes,
    });
  });
  return new Text(deltas);
}

import {
  createDataSourceForDatabase,
  resolveRowForDocInWorkspace,
} from './database-utils.js';
import { normalizeExpression, parseFormula } from './formula/index.js';
import type {
  AutomationRuntimeContext,
  ButtonAutomationContextProvider,
  DatabaseTarget,
  EvaluatedValue,
  PropertyResolver,
  StepResult,
} from './types.js';

export function createPropertyResolver(): PropertyResolver {
  return {
    getPropertyIdByName(dataSource, name) {
      const normalized = name.trim().toLowerCase();
      const column = dataSource.properties$.value.find(
        id =>
          dataSource.propertyNameGet(id)?.trim().toLowerCase() === normalized
      );
      return column;
    },
    getPropertyType(dataSource, propertyId) {
      return dataSource.propertyTypeGet(propertyId);
    },
    getCellValue(dataSource, rowId, propertyId) {
      return dataSource.cellValueGet(rowId, propertyId);
    },
    getRowTitleText(rowId, dataSource) {
      const model = dataSource.doc.getBlock(rowId)?.model;
      return model?.text;
    },
    getRowLinkedDocId(rowId, dataSource) {
      const text = this.getRowTitleText(rowId, dataSource);
      return text ? getSingleDocIdFromText(text) : undefined;
    },
  };
}

export async function resolveSourceContext(
  provider: ButtonAutomationContextProvider,
  host: EditorHost,
  storedSource?: ButtonSourceContext,
  sourceDatabase?: {
    databaseDocId: string;
    databaseBlockId: string;
  }
): Promise<ButtonSourceContext | undefined> {
  const currentDocId = host.store.id;
  if (storedSource) {
    const target = await provider.resolveDatabaseTarget({
      host,
      databaseDocId: storedSource.databaseDocId,
      databaseBlockId: storedSource.databaseBlockId,
    });
    if (target && target.dataSource.rows$.value.includes(storedSource.rowId)) {
      return storedSource;
    }
  }
  return provider.resolveSourceContext({
    host,
    currentDocId,
    storedSource,
    sourceDatabase,
  });
}

export function createRuntimeContext(input: {
  host: EditorHost;
  source: ButtonSourceContext;
  triggeredAt?: Date;
}): AutomationRuntimeContext {
  const sourceDataSource = createDataSourceForDatabase(
    input.host,
    input.source.databaseDocId,
    input.source.databaseBlockId
  );
  if (!sourceDataSource) {
    throw new Error(
      `Source database not found (${input.source.databaseDocId}:${input.source.databaseBlockId})`
    );
  }
  const sourceDatabase = sourceDataSource.doc.getBlock(
    input.source.databaseBlockId
  )?.model as DatabaseBlockModel;
  return {
    host: input.host,
    source: input.source,
    sourceDataSource,
    sourceDatabase,
    triggeredAt: input.triggeredAt ?? new Date(),
    stepResults: new Map<number, StepResult>(),
    currentDocId: input.host.store.id,
  };
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (value instanceof Text) return value.length === 0;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object' && 'start' in (value as object)) {
    const date = value as { start?: number | null };
    return date.start == null;
  }
  return false;
}

export function isTitlePropertyName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === 'name' || normalized === 'title';
}

function resolveLinkedDocTitle(ctx: AutomationRuntimeContext, docId: string) {
  return ctx.host.std.workspace.getDoc(docId)?.meta?.title;
}

function textFromUnknown(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Text) return value.toString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && 'start' in (value as object)) {
    const date = value as { start?: number | null; end?: number | null };
    if (date.start == null) return '';
    return new Date(date.start).toISOString().slice(0, 10);
  }
  return '';
}

function resolveDocIdFromValue(
  value: unknown,
  resolver: PropertyResolver,
  ctx: AutomationRuntimeContext,
  rowId: string
): string | undefined {
  if (typeof value === 'string') {
    const linked = resolver.getRowLinkedDocId(rowId, ctx.sourceDataSource);
    if (linked) return linked;
  }
  const titleText = resolver.getRowTitleText(rowId, ctx.sourceDataSource);
  if (titleText) {
    return getSingleDocIdFromText(titleText);
  }
  return ctx.currentDocId;
}

export function evaluateExpression(
  expr: ButtonValueExpression,
  ctx: AutomationRuntimeContext,
  resolver: PropertyResolver = createPropertyResolver()
): EvaluatedValue {
  const node = normalizeExpression(expr);
  switch (node.type) {
    case 'this_page': {
      const docId =
        resolveDocIdFromValue(undefined, resolver, ctx, ctx.source.rowId) ??
        ctx.currentDocId;
      return { kind: 'linked_doc', docId };
    }
    case 'date_triggered':
      return {
        kind: 'date',
        start: ctx.triggeredAt.getTime(),
        end: null,
      };
    case 'date_range': {
      const startVal = evaluateExpression(node.start, ctx, resolver);
      const endVal = evaluateExpression(node.end, ctx, resolver);
      const start =
        startVal.kind === 'date' ? startVal.start : ctx.triggeredAt.getTime();
      let end: number | null = null;
      if (endVal.kind === 'date') {
        end = endVal.end ?? endVal.start;
      } else if (startVal.kind === 'date' && startVal.end != null) {
        end = startVal.end;
      }
      return { kind: 'date', start, end };
    }
    case 'step_result': {
      const result = ctx.stepResults.get(node.step);
      if (!result) return { kind: 'empty' };
      if (result.docId) {
        return { kind: 'linked_doc', docId: result.docId };
      }
      const dataSource = createDataSourceForDatabase(
        ctx.host,
        result.databaseDocId,
        result.databaseBlockId
      );
      if (!dataSource) return { kind: 'empty' };
      const docId = resolver.getRowLinkedDocId(result.rowId, dataSource);
      if (docId) return { kind: 'linked_doc', docId };
      return { kind: 'empty' };
    }
    case 'property': {
      const propertyId = isTitlePropertyName(node.name)
        ? 'title'
        : resolver.getPropertyIdByName(ctx.sourceDataSource, node.name);
      if (!propertyId) return { kind: 'empty' };
      const value = resolver.getCellValue(
        ctx.sourceDataSource,
        ctx.source.rowId,
        propertyId
      );
      if (propertyId === 'title') {
        const text = resolver.getRowTitleText(
          ctx.source.rowId,
          ctx.sourceDataSource
        );
        const plain = getPlainTextFromText(text, docId =>
          resolveLinkedDocTitle(ctx, docId)
        ).trim();
        return plain ? { kind: 'text', value: plain } : { kind: 'empty' };
      }
      if (isEmptyValue(value)) return { kind: 'empty' };
      const propertyType = resolver.getPropertyType(
        ctx.sourceDataSource,
        propertyId
      );
      if (propertyType === 'link') {
        const docId = getSingleDocIdFromText(value as Text);
        if (docId) return { kind: 'linked_doc', docId };
      }
      if (propertyType === 'rich-text') {
        const docId = getSingleDocIdFromText(value as Text);
        if (docId)
          return { kind: 'linked_doc', docId, title: textFromUnknown(value) };
      }
      if (propertyType === 'select') {
        return { kind: 'select', optionId: String(value) };
      }
      if (propertyType === 'multi-select') {
        return {
          kind: 'multi_select',
          optionIds: Array.isArray(value) ? value.map(String) : [],
        };
      }
      if (propertyType === 'date') {
        const date = value as { start?: number; end?: number | null };
        return {
          kind: 'date',
          start: date.start ?? ctx.triggeredAt.getTime(),
          end: date.end ?? null,
        };
      }
      return { kind: 'text', value: textFromUnknown(value) };
    }
    case 'property_of': {
      if (node.base.type === 'this_page') {
        const propertyId = resolver.getPropertyIdByName(
          ctx.sourceDataSource,
          node.name
        );
        if (!propertyId) return { kind: 'empty' };
        const value = resolver.getCellValue(
          ctx.sourceDataSource,
          ctx.source.rowId,
          propertyId
        );
        if (isEmptyValue(value)) return { kind: 'empty' };
        const propertyType = resolver.getPropertyType(
          ctx.sourceDataSource,
          propertyId
        );
        if (propertyType === 'link') {
          const docId = getSingleDocIdFromText(value as Text);
          if (docId) return { kind: 'linked_doc', docId };
        }
        if (propertyType === 'date') {
          const date = value as { start?: number; end?: number | null };
          return {
            kind: 'date',
            start: date.start ?? ctx.triggeredAt.getTime(),
            end: date.end ?? null,
          };
        }
        return { kind: 'text', value: textFromUnknown(value) };
      }
      if (node.base.type === 'property') {
        const baseValue = evaluateExpression(node.base, ctx, resolver);
        if (baseValue.kind === 'linked_doc') {
          const target = resolveDatabaseForDoc(ctx, baseValue.docId);
          if (!target?.rowId) return { kind: 'empty' };
          const propertyId = resolver.getPropertyIdByName(
            target.dataSource,
            node.name
          );
          if (!propertyId) return { kind: 'empty' };
          const value = resolver.getCellValue(
            target.dataSource,
            target.rowId,
            propertyId
          );
          if (isEmptyValue(value)) return { kind: 'empty' };
          return { kind: 'text', value: textFromUnknown(value) };
        }
        return baseValue.kind === 'text' ? baseValue : { kind: 'empty' };
      }
      const base = evaluateExpression(node.base, ctx, resolver);
      if (base.kind !== 'linked_doc') return { kind: 'empty' };
      const target = resolveDatabaseForDoc(ctx, base.docId);
      if (!target?.rowId) return { kind: 'empty' };
      const propertyId = resolver.getPropertyIdByName(
        target.dataSource,
        node.name
      );
      if (!propertyId) return { kind: 'empty' };
      const value = resolver.getCellValue(
        target.dataSource,
        target.rowId,
        propertyId
      );
      if (isEmptyValue(value)) return { kind: 'empty' };
      return { kind: 'text', value: textFromUnknown(value) };
    }
    case 'literal':
      return { kind: 'text', value: node.value };
    case 'concat': {
      const parts = node.parts.map(part =>
        evaluateExpression(part, ctx, resolver)
      );
      const docIds = parts
        .filter(
          (part): part is Extract<EvaluatedValue, { kind: 'linked_doc' }> =>
            part.kind === 'linked_doc'
        )
        .map(part => part.docId);
      if (docIds.length === parts.length && docIds.length > 0) {
        return { kind: 'linked_docs', docIds };
      }
      const text = parts
        .map(part => {
          if (part.kind === 'text') return part.value;
          if (part.kind === 'linked_doc') return part.title ?? '';
          if (part.kind === 'empty') return '';
          return textFromUnknown(part);
        })
        .join('');
      return text ? { kind: 'text', value: text } : { kind: 'empty' };
    }
    case 'if_empty': {
      const value = evaluateExpression(node.value, ctx, resolver);
      const isEmpty = value.kind === 'empty';
      return evaluateExpression(isEmpty ? node.then : node.else, ctx, resolver);
    }
    case 'if': {
      const condition = evaluateExpression(node.condition, ctx, resolver);
      let pickThen = false;
      if (node.condition.type === 'not_empty') {
        pickThen = condition.kind !== 'empty';
      } else if (node.condition.type === 'empty') {
        pickThen = condition.kind === 'empty';
      } else {
        pickThen = condition.kind !== 'empty';
      }
      return evaluateExpression(
        pickThen ? node.then : node.else,
        ctx,
        resolver
      );
    }
    case 'not_empty': {
      const value = evaluateExpression(node.value, ctx, resolver);
      return value.kind === 'empty'
        ? { kind: 'boolean', value: false }
        : { kind: 'boolean', value: true };
    }
    case 'empty': {
      const value = evaluateExpression(node.value, ctx, resolver);
      return value.kind === 'empty'
        ? { kind: 'boolean', value: true }
        : { kind: 'boolean', value: false };
    }
    case 'not_empty_marker': {
      const value = evaluateExpression(node.value, ctx, resolver);
      const marker = value.kind === 'empty' ? '❌' : node.marker;
      return { kind: 'text', value: marker };
    }
    case 'formula': {
      const parsed = parseFormula(node.source);
      if (parsed.type === 'formula') {
        return { kind: 'text', value: node.source };
      }
      return evaluateExpression(parsed, ctx, resolver);
    }
    default:
      return { kind: 'empty' };
  }
}

function textFromEvaluated(value: EvaluatedValue): string {
  switch (value.kind) {
    case 'text':
      return value.value;
    case 'linked_doc':
      return value.title ?? '';
    case 'linked_docs':
      return '';
    case 'date':
      return new Date(value.start).toISOString().slice(0, 10);
    case 'select':
    case 'multi_select':
      return '';
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'empty':
      return '';
    case 'unknown':
      return textFromUnknown(value.value);
    default:
      return '';
  }
}

export function evaluateExpressionAsString(
  expr: ButtonValueExpression,
  ctx: AutomationRuntimeContext,
  resolver?: PropertyResolver
): string {
  return textFromEvaluated(
    evaluateExpression(expr, ctx, resolver ?? createPropertyResolver())
  );
}

function resolveDatabaseForDoc(
  ctx: AutomationRuntimeContext,
  docId: string
): (DatabaseTarget & { rowId?: string }) | undefined {
  return resolveRowForDocInWorkspace(ctx.host, docId);
}

export function setRowTitleFromEvaluated(
  rowId: string,
  dataSource: DatabaseBlockDataSource,
  value: EvaluatedValue,
  _provider: ButtonAutomationContextProvider
) {
  const model = dataSource.doc.getBlock(rowId)?.model;
  if (!model?.text) return;
  const text = model.text as Text;
  text.clear();
  if (value.kind === 'linked_doc') {
    text.insert(REFERENCE_NODE, 0, {
      reference: {
        type: 'LinkedPage',
        pageId: value.docId,
      },
    } satisfies AffineTextAttributes as BaseTextAttributes);
    if (value.title) {
      dataSource.doc.workspace.meta.setDocMeta(value.docId, {
        title: value.title,
      });
    }
    return;
  }
  const plain = textFromEvaluated(value);
  if (plain) {
    text.insert(plain, 0);
  }
}

export function setCellFromEvaluated(
  rowId: string,
  propertyId: string,
  dataSource: DatabaseBlockDataSource,
  value: EvaluatedValue,
  provider: ButtonAutomationContextProvider,
  host: EditorHost
) {
  if (propertyId === 'title') {
    setRowTitleFromEvaluated(rowId, dataSource, value, provider);
    return;
  }
  const propertyType = dataSource.propertyTypeGet(propertyId);
  if (!propertyType) return;

  if (value.kind === 'empty') {
    clearCellValue(rowId, propertyId, propertyType, dataSource);
    return;
  }

  if (value.kind === 'boolean') {
    if (propertyType === 'checkbox') {
      dataSource.cellValueChange(rowId, propertyId, value.value);
    }
    return;
  }

  if (value.kind === 'linked_docs') {
    dataSource.cellValueChange(
      rowId,
      propertyId,
      createLinkedDocCellText(value.docIds)
    );
    return;
  }

  if (value.kind === 'linked_doc') {
    const url = provider.buildDocUrl(value.docId, host);
    if (propertyType === 'link' && url) {
      dataSource.cellValueChange(rowId, propertyId, url);
      return;
    }
    dataSource.cellValueChange(
      rowId,
      propertyId,
      createLinkedDocCellText([value.docId])
    );
    return;
  }

  if (value.kind === 'date') {
    dataSource.cellValueChange(rowId, propertyId, {
      start: value.start,
      end: value.end ?? null,
    });
    return;
  }

  if (value.kind === 'select') {
    dataSource.cellValueChange(rowId, propertyId, value.optionId);
    return;
  }

  if (value.kind === 'multi_select') {
    dataSource.cellValueChange(rowId, propertyId, value.optionIds);
    return;
  }

  if (value.kind === 'text') {
    if (propertyType === 'select') {
      const optionId = resolveSelectOptionId(
        dataSource,
        propertyId,
        value.value
      );
      if (optionId) {
        dataSource.cellValueChange(rowId, propertyId, optionId);
      }
      return;
    }
    if (propertyType === 'checkbox') {
      const normalized = value.value.trim().toLowerCase();
      dataSource.cellValueChange(
        rowId,
        propertyId,
        ['true', 'yes', '1'].includes(normalized)
      );
      return;
    }
    if (propertyType === 'number') {
      const parsed = Number(value.value);
      if (!Number.isNaN(parsed)) {
        dataSource.cellValueChange(rowId, propertyId, parsed);
      }
      return;
    }
    if (propertyType === 'link') {
      dataSource.cellValueChange(rowId, propertyId, value.value);
      return;
    }
    dataSource.cellValueChange(rowId, propertyId, new Text(value.value));
    return;
  }
}

function clearCellValue(
  rowId: string,
  propertyId: string,
  propertyType: string,
  dataSource: DatabaseBlockDataSource
) {
  switch (propertyType) {
    case 'checkbox':
      dataSource.cellValueChange(rowId, propertyId, false);
      return;
    case 'number':
    case 'select':
    case 'multi-select':
      dataSource.cellValueChange(rowId, propertyId, null);
      return;
    case 'date':
      dataSource.cellValueChange(rowId, propertyId, { start: null, end: null });
      return;
    case 'link':
      dataSource.cellValueChange(rowId, propertyId, '');
      return;
    default:
      dataSource.cellValueChange(rowId, propertyId, new Text());
  }
}

export function resolveSelectOptionId(
  dataSource: DatabaseBlockDataSource,
  propertyId: string,
  label: string
): string | undefined {
  const data = dataSource.propertyDataGet(propertyId) as
    | { options?: { id: string; value: string }[] }
    | undefined;
  const option = data?.options?.find(
    item => item.value.trim().toLowerCase() === label.trim().toLowerCase()
  );
  return option?.id;
}
