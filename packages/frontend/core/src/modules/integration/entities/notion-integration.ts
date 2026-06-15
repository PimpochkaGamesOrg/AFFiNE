import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { Text, type DeltaInsert } from '@blocksuite/affine/store';
import { Entity, LiveData } from '@toeverything/infra';
import { chunk } from 'lodash-es';

import type { DocsService } from '../../doc';
import { WorkspaceServerService } from '../../cloud';
import { IntegrationPropertyService } from '../services/integration-property';
import { blocksToMarkdown, getPageTitle } from '../notion/blocks-to-markdown';
import { NotionApiClient } from '../notion/notion-api';
import {
  ensureColumn,
  resolveMultiSelectOptionIds,
  resolveSelectOptionId,
} from '../notion/property-columns';
import { getCellValueForProperty } from '../notion/property-mapper';
import type { NotionDatabasePropertySchema, NotionPage } from '../notion/types';
import type { NotionRefMeta } from '../type';
import type { IntegrationRefStore } from '../store/integration-ref';
import type { NotionStore } from '../store/notion';
import type { NotionConfig } from '../type';
import { encryptPBKDF2 } from '../utils/encrypt';
import type { IntegrationWriter } from './writer';

const BATCH_SIZE = 1;

export class NotionIntegration extends Entity<{ writer: IntegrationWriter }> {
  writer = this.props.writer;

  syncing$ = new LiveData(false);
  progress$ = new LiveData({ done: 0, hasMore: false });

  constructor(
    private readonly integrationRefStore: IntegrationRefStore,
    private readonly notionStore: NotionStore,
    private readonly docsService: DocsService,
    private readonly workspaceServerService: WorkspaceServerService
  ) {
    super();
  }

  settings$(databaseBlockId: string) {
    return LiveData.from(
      this.notionStore.watchSetting(databaseBlockId),
      undefined
    );
  }

  updateSetting<Key extends keyof NotionConfig>(
    databaseBlockId: string,
    key: Key,
    value: NotionConfig[Key]
  ) {
    this.notionStore.setSetting(databaseBlockId, key, value);
  }

  connect(databaseBlockId: string, token: string, notionDatabaseId: string) {
    this.notionStore.setSettings(databaseBlockId, {
      token,
      notionDatabaseId,
      lastSyncCursor: null,
      syncedCount: 0,
    });
  }

  disconnect(databaseBlockId: string) {
    this.notionStore.clearSettings(databaseBlockId);
  }

  private getApiBaseUrl() {
    return (
      this.workspaceServerService.server?.baseUrl ??
      (typeof window !== 'undefined' ? window.location.origin : '')
    );
  }

  async verifyToken(token: string) {
    const client = new NotionApiClient(this.getApiBaseUrl(), token);
    await client.verifyToken();
  }

  async getRefs(databaseBlockId: string) {
    const token = this.notionStore.getSetting(databaseBlockId, 'token');
    if (!token) return [];

    const integrationId = await encryptPBKDF2(
      `${token}:${databaseBlockId}`
    );

    return this.integrationRefStore
      .getRefs({ type: 'notion', integrationId })
      .map(ref => ({
        ...ref,
        refMeta: ref.refMeta as NotionRefMeta,
      }));
  }

  private async ensureDocLoaded(docId: string) {
    const docRef = this.docsService.open(docId);
    if (!docRef.doc.blockSuiteDoc.ready) {
      docRef.doc.blockSuiteDoc.load();
    }
    const disposePriorityLoad = docRef.doc.addPriorityLoad(10);
    await docRef.doc.waitForSyncReady();
    disposePriorityLoad();
    return docRef;
  }

  private createLinkedTitleText(docId: string) {
    return new Text<AffineTextAttributes>([
      {
        insert: ' ',
        attributes: { reference: { type: 'LinkedPage', pageId: docId } },
      },
    ] satisfies DeltaInsert<AffineTextAttributes>[]);
  }

  private applyPageProperties(
    page: NotionPage,
    datasource: DatabaseBlockDataSource,
    rowId: string,
    schema: Record<string, NotionDatabasePropertySchema>
  ) {
    for (const [propertyName, property] of Object.entries(page.properties)) {
      if (property.type === 'title') continue;

      const columnId = ensureColumn(
        datasource,
        propertyName,
        property,
        schema[propertyName]
      );
      if (!columnId) continue;

      const cellValue = getCellValueForProperty(
        property,
        name => resolveSelectOptionId(datasource, columnId, name),
        names => resolveMultiSelectOptionIds(datasource, columnId, names)
      );
      if (cellValue === undefined) continue;

      datasource.cellValueChange(rowId, columnId, cellValue);
    }
  }

  private async syncPage(
    page: NotionPage,
    options: {
      client: NotionApiClient;
      datasource: DatabaseBlockDataSource;
      titleColumnId?: string;
      integrationId: string;
      localRef?: { id: string; refMeta: NotionRefMeta };
      updateStrategy: NotionConfig['updateStrategy'];
      schema: Record<string, NotionDatabasePropertySchema>;
    }
  ) {
    const {
      client,
      datasource,
      titleColumnId,
      integrationId,
      localRef,
      updateStrategy = 'override',
      schema,
    } = options;

    const title = getPageTitle(page);
    const blocks = await client.getAllBlockChildren(page.id);
    const markdown = await blocksToMarkdown(blocks, blockId =>
      client.getAllBlockChildren(blockId)
    );

    const docId = await this.writer.writeDoc({
      title,
      content: markdown || title,
      docId: localRef?.id,
      updateStrategy,
    });

    let rowId = localRef?.refMeta.rowId;
    if (!rowId) {
      rowId = datasource.rowAdd('end');
      if (titleColumnId) {
        datasource.cellValueChange(
          rowId,
          titleColumnId,
          this.createLinkedTitleText(docId)
        );
      }
    } else if (titleColumnId) {
      datasource.cellValueChange(
        rowId,
        titleColumnId,
        this.createLinkedTitleText(docId)
      );
    }

    this.applyPageProperties(page, datasource, rowId, schema);

    const { doc, release } = this.docsService.open(docId);
    doc.scope.get(IntegrationPropertyService).updateIntegrationProperties(
      'notion',
      {
        notionPageId: page.id,
        notionUrl: page.url,
        lastEditedAt: page.last_edited_time,
      }
    );
    release();

    this.integrationRefStore.createRef(docId, {
      type: 'notion',
      integrationId,
      refMeta: {
        notionPageId: page.id,
        updatedAt: page.last_edited_time,
        rowId,
      },
    });

    return docId;
  }

  async syncDatabase(options: {
    databaseBlockId: string;
    pageDocId: string;
    signal?: AbortSignal;
    onProgress?: (done: number, hasMore: boolean) => void;
    onComplete?: () => void;
    onAbort?: (finished: number) => void;
  }) {
    const { databaseBlockId, pageDocId, signal, onProgress, onComplete, onAbort } =
      options;

    const token = this.notionStore.getSetting(databaseBlockId, 'token');
    const notionDatabaseId = this.notionStore.getSetting(
      databaseBlockId,
      'notionDatabaseId'
    );
    if (!token || !notionDatabaseId) {
      throw new Error('Notion token and database ID are required');
    }

    this.syncing$.next(true);
    let finished = this.notionStore.getSetting(databaseBlockId, 'syncedCount') ?? 0;

    try {
      const client = new NotionApiClient(this.getApiBaseUrl(), token);
      const notionDatabase = await client.getDatabase(notionDatabaseId);
      const schema = notionDatabase.properties;
      const integrationId = await encryptPBKDF2(
        `${token}:${databaseBlockId}`
      );
      const updateStrategy =
        this.notionStore.getSetting(databaseBlockId, 'updateStrategy') ??
        'override';

      const docRef = await this.ensureDocLoaded(pageDocId);
      try {
      const dbModel = docRef.doc.blockSuiteDoc.getModelById(
        databaseBlockId
      ) as DatabaseBlockModel | null;
      if (!dbModel) {
        throw new Error('Database block not found');
      }

      const datasource = new DatabaseBlockDataSource(dbModel);
      const titleColumnId =
        dbModel.props.columns.find(column => column.type === 'title')?.id ??
        dbModel.props.views[0]?.header?.titleColumn;

      const localRefs = await this.getRefs(databaseBlockId);
      const localRefsMap = new Map(
        localRefs.map(ref => [ref.refMeta.notionPageId, ref])
      );

      let cursor =
        this.notionStore.getSetting(databaseBlockId, 'lastSyncCursor') ?? null;
      let hasMore = true;

      while (hasMore) {
        if (signal?.aborted) {
          onAbort?.(finished);
          return;
        }

        const response = await client.queryDatabase(notionDatabaseId, cursor);
        const pages = response.results;

        for (const pageChunk of chunk(pages, BATCH_SIZE)) {
          if (signal?.aborted) {
            onAbort?.(finished);
            return;
          }

          await Promise.all(
            pageChunk.map(async page => {
              await new Promise<void>(resolve => {
                requestIdleCallback(() => resolve(), { timeout: 500 });
              });

              const localRef = localRefsMap.get(page.id);
              const localUpdatedAt = localRef?.refMeta.updatedAt;
              if (
                localUpdatedAt &&
                localUpdatedAt === page.last_edited_time &&
                localRef
              ) {
                finished++;
                return;
              }

              await this.syncPage(page, {
                client,
                datasource,
                titleColumnId,
                integrationId,
                localRef,
                updateStrategy,
                schema,
              });
              finished++;
            })
          );

          this.notionStore.setSetting(databaseBlockId, 'syncedCount', finished);
          this.progress$.next({ done: finished, hasMore: response.has_more });
          onProgress?.(finished, response.has_more);
        }

        hasMore = response.has_more;
        cursor = response.next_cursor;
        this.notionStore.setSetting(databaseBlockId, 'lastSyncCursor', cursor);
      }

      this.notionStore.setSettings(databaseBlockId, {
        lastSyncCursor: null,
        lastSyncAt: new Date().toISOString(),
        syncedCount: finished,
      });
      onComplete?.();
      } finally {
        docRef.release();
      }
    } finally {
      this.syncing$.next(false);
    }
  }

  resetProgress(databaseBlockId: string) {
    this.notionStore.setSettings(databaseBlockId, {
      lastSyncCursor: null,
      syncedCount: 0,
    });
  }
}
