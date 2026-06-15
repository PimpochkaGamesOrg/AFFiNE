import type { ReadonlySignal } from '@preact/signals-core';

import { multiSelectPropertyType } from '../../property-presets/multi-select/define.js';
import { selectPropertyType } from '../../property-presets/select/define.js';
import type { TableViewSelectionWithType } from './selection';
import { TableViewRowSelection } from './selection';

export interface TableCell {
  rowId: string;
  setTagDraft?(value: string): void;
}

const TAG_COLUMN_TYPES = new Set<string>([
  selectPropertyType.type,
  multiSelectPropertyType.type,
]);

export type ColumnAccessor<T extends TableCell> = (cell: T) =>
  | {
      valueSetFromString(rowId: string, value: string): void;
      type$: ReadonlySignal<string>;
    }
  | undefined;

export interface StartEditOptions<T extends TableCell> {
  event: KeyboardEvent;
  selection: TableViewSelectionWithType | undefined;
  getCellContainer: (
    groupKey: string | undefined,
    rowIndex: number,
    columnIndex: number
  ) => T | undefined;
  updateSelection: (sel: TableViewSelectionWithType) => void;
  getColumn: ColumnAccessor<T>;
}

export function handleCharStartEdit<T extends TableCell>(
  options: StartEditOptions<T>
): boolean {
  const { event, selection, getCellContainer, updateSelection, getColumn } =
    options;

  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    return false;
  }

  if (
    selection &&
    !TableViewRowSelection.is(selection) &&
    !selection.isEditing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.length === 1
  ) {
    const cell = getCellContainer(
      selection.groupKey,
      selection.focus.rowIndex,
      selection.focus.columnIndex
    );
    if (cell) {
      const column = getColumn(cell);
      if (column) {
        if (TAG_COLUMN_TYPES.has(column.type$.value) && cell.setTagDraft) {
          cell.setTagDraft(event.key);
        } else {
          column.valueSetFromString(cell.rowId, event.key);
        }
      }
      updateSelection({ ...selection, isEditing: true });
      event.preventDefault();
      return true;
    }
  }
  return false;
}

export const handleTableWheel = (event: WheelEvent) => {
  if (event.metaKey || event.ctrlKey) {
    return;
  }
  const ele = event.currentTarget;
  if (!(ele instanceof HTMLElement)) {
    return;
  }
  const canScrollX = ele.scrollWidth > ele.clientWidth;
  const canScrollY = ele.scrollHeight > ele.clientHeight;
  if (!canScrollX && !canScrollY) {
    return;
  }
  const horizontalDelta = event.shiftKey ? event.deltaY : event.deltaX;
  const verticalDelta = event.shiftKey ? 0 : event.deltaY;
  if (canScrollX && horizontalDelta !== 0) {
    const atLeft = ele.scrollLeft <= 0;
    const atRight =
      ele.scrollLeft + ele.clientWidth >= ele.scrollWidth - 1;
    if (
      (horizontalDelta < 0 && !atLeft) ||
      (horizontalDelta > 0 && !atRight)
    ) {
      event.stopPropagation();
      return;
    }
  }
  if (canScrollY && verticalDelta !== 0) {
    const atTop = ele.scrollTop <= 0;
    const atBottom =
      ele.scrollTop + ele.clientHeight >= ele.scrollHeight - 1;
    if ((verticalDelta < 0 && !atTop) || (verticalDelta > 0 && !atBottom)) {
      event.stopPropagation();
    }
  }
};
