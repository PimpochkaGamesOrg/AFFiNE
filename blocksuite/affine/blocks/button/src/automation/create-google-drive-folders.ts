import type {
  ButtonCreateGoogleDriveFoldersAction,
  ButtonValueExpression,
  GoogleDriveFoldersUrlField,
} from '@blocksuite/affine-model';

import {
  createPropertyResolver,
  evaluateExpression,
  evaluateExpressionAsString,
  isTitlePropertyName,
  setCellFromEvaluated,
} from './expression.js';
import type {
  AutomationRuntimeContext,
  ButtonAutomationContextProvider,
  PropertyResolver,
} from './types.js';

export type CreateGoogleDriveFoldersRequest = {
  categoryName: string;
  episodeTitle: string;
  parentFolderId?: string;
};

export type CreateGoogleDriveFoldersResponse = {
  status: 'success' | 'error';
  message?: string;
  episodeFolderUrl?: string;
  categoryFolderUrl?: string;
};

export function resolveExpressionText(
  expr: ButtonValueExpression,
  ctx: AutomationRuntimeContext,
  resolver: PropertyResolver
): string {
  const evaluated = evaluateExpression(expr, ctx, resolver);
  if (evaluated.kind === 'linked_doc') {
    const fromCell = evaluated.title?.trim() ?? '';
    if (fromCell) return fromCell;
    return (
      ctx.host.std.workspace.getDoc(evaluated.docId)?.meta?.title?.trim() ?? ''
    );
  }
  return evaluateExpressionAsString(expr, ctx, resolver);
}

export function buildCreateFoldersRequest(
  action: ButtonCreateGoogleDriveFoldersAction,
  ctx: AutomationRuntimeContext,
  resolver: PropertyResolver
): CreateGoogleDriveFoldersRequest | { error: string } {
  const episodeTitle = resolveExpressionText(
    action.episodeTitle,
    ctx,
    resolver
  ).trim();
  if (!episodeTitle) {
    return { error: 'Episode title is empty' };
  }

  const categoryName = resolveExpressionText(
    action.categoryName,
    ctx,
    resolver
  ).trim();
  if (!categoryName) {
    return { error: 'Category name is empty' };
  }

  const request: CreateGoogleDriveFoldersRequest = {
    categoryName,
    episodeTitle,
  };

  if (action.parentFolderId) {
    const parentFolderId = resolveExpressionText(
      action.parentFolderId,
      ctx,
      resolver
    ).trim();
    if (parentFolderId) {
      request.parentFolderId = parentFolderId;
    }
  }

  return request;
}

export function extractFolderUrlFromResponse(
  response: CreateGoogleDriveFoldersResponse,
  field: GoogleDriveFoldersUrlField = 'episodeFolderUrl'
): string | undefined {
  return response[field]?.trim() || undefined;
}

export async function executeCreateGoogleDriveFoldersAction(input: {
  action: ButtonCreateGoogleDriveFoldersAction;
  ctx: AutomationRuntimeContext;
  provider: ButtonAutomationContextProvider;
  resolver?: PropertyResolver;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const googleDrive = input.provider.googleDrive;
  if (!googleDrive) {
    return {
      ok: false,
      message:
        'Google Drive integration is unavailable. Sign in to AFFiNE cloud first.',
    };
  }

  const resolver = input.resolver ?? createPropertyResolver();
  const targetProperty = input.action.targetProperty.trim();
  if (!targetProperty) {
    return { ok: false, message: 'Target link property is not configured' };
  }

  const propertyId = isTitlePropertyName(targetProperty)
    ? 'title'
    : resolver.getPropertyIdByName(input.ctx.sourceDataSource, targetProperty);
  if (!propertyId) {
    return {
      ok: false,
      message: `Property «${targetProperty}» not found in source database`,
    };
  }

  const propertyType = resolver.getPropertyType(
    input.ctx.sourceDataSource,
    propertyId
  );
  if (propertyType !== 'link') {
    return {
      ok: false,
      message: `Property «${targetProperty}» must be a Link column`,
    };
  }

  const request = buildCreateFoldersRequest(input.action, input.ctx, resolver);
  if ('error' in request) {
    return { ok: false, message: request.error };
  }

  const authResult = await googleDrive.ensureAuthorized();
  if (!authResult.ok) {
    return { ok: false, message: authResult.message };
  }

  let apiResult = await googleDrive.createFolders(request);
  if (!apiResult.ok && apiResult.authRequired) {
    const retryAuth = await googleDrive.ensureAuthorized();
    if (!retryAuth.ok) {
      return { ok: false, message: retryAuth.message };
    }
    apiResult = await googleDrive.createFolders(request);
  }

  if (!apiResult.ok) {
    return { ok: false, message: apiResult.message };
  }

  const urlField = input.action.resultUrlField ?? 'episodeFolderUrl';
  const folderUrl = extractFolderUrlFromResponse(apiResult.data, urlField);
  if (!folderUrl) {
    return {
      ok: false,
      message: `Google Drive response does not contain ${urlField}`,
    };
  }

  input.ctx.sourceDataSource.doc.captureSync();
  setCellFromEvaluated(
    input.ctx.source.rowId,
    propertyId,
    input.ctx.sourceDataSource,
    { kind: 'text', value: folderUrl },
    input.provider,
    input.ctx.host
  );

  return { ok: true };
}
