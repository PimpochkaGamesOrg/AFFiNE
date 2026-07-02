import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import * as Y from 'yjs';

import { EventBus } from '../../base';
import { PgWorkspaceDocStorageAdapter } from '../../core/doc';

const PARAGRAPH_FLAVOUR = 'affine:paragraph';
const DATABASE_FLAVOUR = 'affine:database';
const PARAGRAPH_VERSION = 1;

const STATUS_COLUMN_CANDIDATES = ['Статус', 'Status', 'статус'];
const DIRECTION_COLUMN_CANDIDATES = ['Направление', 'Direction', 'направление'];

const STATUS_COLOR = 'var(--affine-tag-green)';
const DIRECTION_COLOR = 'var(--affine-tag-blue)';

const ROW_ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const newRowId = customAlphabet(ROW_ID_ALPHABET, 10);
const newOptionId = customAlphabet(ROW_ID_ALPHABET, 10);

export interface AddDatabaseRowInput {
  workspaceId: string;
  docId: string;
  title: string;
  status: string;
  direction: string;
  editorId?: string;
}

export interface AddDatabaseRowResult {
  rowId: string;
}

interface SelectOption {
  id: string;
  color: string;
  value: string;
}

interface ColumnData {
  id: string;
  type: string;
  name: string;
  data: { options?: SelectOption[]; [key: string]: unknown };
}

interface CellValue {
  columnId: string;
  value: unknown;
}

@Injectable()
export class ExternalApiService {
  private readonly logger = new Logger(ExternalApiService.name);

  constructor(
    private readonly storage: PgWorkspaceDocStorageAdapter,
    private readonly event: EventBus
  ) {}

  async addDatabaseRow(
    input: AddDatabaseRowInput
  ): Promise<AddDatabaseRowResult> {
    const { workspaceId, docId, title, status, direction } = input;

    const record = await this.storage.getDoc(workspaceId, docId);
    if (!record?.bin) {
      throw new NotFoundException(
        `Document ${docId} not found in workspace ${workspaceId}`
      );
    }

    const existingBin = this.toUint8(record.bin);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, existingBin);
    const beforeVector = Y.encodeStateVectorFromUpdate(existingBin);

    const yBlocks = doc.getMap('blocks');
    if (!yBlocks) {
      throw new NotFoundException(
        `Document ${docId} has no blocks map; not a valid AFFiNE database doc`
      );
    }

    const databaseId = this.findDatabaseBlockId(yBlocks);
    if (!databaseId) {
      throw new NotFoundException(
        `No affine:database block found in document ${docId}`
      );
    }

    const dbBlock = yBlocks.get(databaseId) as Y.Map<unknown>;
    const rowId = newRowId();

    doc.transact(() => {
      this.createRowBlock(yBlocks, rowId, title);
      this.appendRowToDatabase(dbBlock, rowId);

      this.setSelectCell(
        yBlocks,
        dbBlock,
        rowId,
        STATUS_COLUMN_CANDIDATES,
        status,
        STATUS_COLOR
      );
      this.setSelectCell(
        yBlocks,
        dbBlock,
        rowId,
        DIRECTION_COLUMN_CANDIDATES,
        direction,
        DIRECTION_COLOR
      );
    });

    const update = Y.encodeStateAsUpdate(doc, beforeVector);
    doc.destroy();

    if (this.storage.isEmptyBin(update)) {
      this.logger.warn(
        `Computed empty update for doc=${docId} title="${title}", skipping push`
      );
      return { rowId };
    }

    const timestamp = await this.storage.pushDocUpdates(
      workspaceId,
      docId,
      [update],
      input.editorId
    );

    this.event.emit('doc.updates.pushed', {
      spaceType: 'workspace',
      spaceId: workspaceId,
      docId,
      updates: [update],
      timestamp,
      editor: input.editorId,
    });

    this.logger.log(
      `Added database row docId=${docId} rowId=${rowId} title="${title}" status=${status} direction=${direction}`
    );

    return { rowId };
  }

  private toUint8(bin: Uint8Array | Buffer): Uint8Array {
    if (Buffer.isBuffer(bin)) {
      return new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength);
    }
    return bin;
  }

  private findDatabaseBlockId(yBlocks: Y.Map<unknown>): string | null {
    for (const [id, block] of yBlocks.entries()) {
      if (
        block instanceof Y.Map &&
        block.get('sys:flavour') === DATABASE_FLAVOUR
      ) {
        return id;
      }
    }
    return null;
  }

  private createRowBlock(
    yBlocks: Y.Map<unknown>,
    rowId: string,
    title: string
  ): void {
    const yBlock = new Y.Map<unknown>();
    yBlock.set('sys:id', rowId);
    yBlock.set('sys:flavour', PARAGRAPH_FLAVOUR);
    yBlock.set('sys:version', PARAGRAPH_VERSION);
    yBlock.set('sys:children', new Y.Array<string>());

    const text = new Y.Text();
    if (title.length > 0) {
      text.insert(0, title);
    }
    yBlock.set('prop:text', text);
    yBlock.set('prop:type', 'text');

    yBlocks.set(rowId, yBlock);
  }

  private appendRowToDatabase(dbBlock: Y.Map<unknown>, rowId: string): void {
    const children = dbBlock.get('sys:children') as Y.Array<string>;
    if (!(children instanceof Y.Array)) {
      throw new Error('Database block sys:children is not a Y.Array');
    }
    children.push([rowId]);
  }

  private setSelectCell(
    yBlocks: Y.Map<unknown>,
    dbBlock: Y.Map<unknown>,
    rowId: string,
    columnNameCandidates: readonly string[],
    desiredValue: string,
    fallbackOptionColor: string
  ): void {
    if (!desiredValue) {
      return;
    }

    const columns = dbBlock.get('prop:columns') as Y.Array<ColumnData>;
    if (!(columns instanceof Y.Array)) {
      this.logger.warn(
        `Database has no prop:columns Y.Array; skipping cell for "${desiredValue}"`
      );
      return;
    }

    const column = this.findColumnByName(columns, columnNameCandidates);
    if (!column) {
      this.logger.warn(
        `Column not found for candidates=${columnNameCandidates.join('/')}; skipping value="${desiredValue}"`
      );
      return;
    }

    const optionId = this.ensureSelectOption(
      columns,
      column,
      desiredValue,
      fallbackOptionColor
    );
    this.writeCell(dbBlock, rowId, column.id, optionId);
  }

  private findColumnByName(
    columns: Y.Array<ColumnData>,
    candidates: readonly string[]
  ): ColumnData | null {
    const all = columns.toArray();
    for (const candidate of candidates) {
      const lower = candidate.toLowerCase();
      const found = all.find(col => col?.name?.toLowerCase() === lower);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private ensureSelectOption(
    columns: Y.Array<ColumnData>,
    column: ColumnData,
    desiredValue: string,
    fallbackColor: string
  ): string {
    const options = Array.isArray(column.data?.options)
      ? column.data.options
      : [];
    const existing = options.find(
      opt => opt?.value?.toLowerCase() === desiredValue.toLowerCase()
    );
    if (existing) {
      return existing.id;
    }

    const option: SelectOption = {
      id: newOptionId(),
      color: fallbackColor,
      value: desiredValue,
    };

    const index = this.findColumnIndex(columns, column.id);
    if (index === -1) {
      throw new Error(
        `Column ${column.id} not found in Y.Array while adding option`
      );
    }

    const updated: ColumnData = {
      ...column,
      data: { ...column.data, options: [...options, option] },
    };
    columns.delete(index, 1);
    columns.insert(index, [updated]);

    return option.id;
  }

  private findColumnIndex(
    columns: Y.Array<ColumnData>,
    columnId: string
  ): number {
    return columns.toArray().findIndex(col => col?.id === columnId);
  }

  private writeCell(
    dbBlock: Y.Map<unknown>,
    rowId: string,
    columnId: string,
    value: unknown
  ): void {
    const cells = dbBlock.get('prop:cells') as Y.Map<Y.Map<CellValue>>;
    if (!(cells instanceof Y.Map)) {
      throw new Error('Database block prop:cells is not a Y.Map');
    }

    let rowCells = cells.get(rowId);
    if (!(rowCells instanceof Y.Map)) {
      rowCells = new Y.Map<CellValue>();
      cells.set(rowId, rowCells);
    }
    rowCells.set(columnId, { columnId, value });
  }
}
