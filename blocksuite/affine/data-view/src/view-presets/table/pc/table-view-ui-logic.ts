import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import { AddCursorIcon } from '@blocksuite/icons/lit';
import { effect, signal } from '@preact/signals-core';
import type { TemplateResult } from 'lit';
import { ref } from 'lit/directives/ref.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import type { Group, GroupTrait } from '../../../core/group-by/trait.js';
import {
  createUniComponentFromWebComponent,
  renderUniLit,
} from '../../../core/index.js';
import { createDndContext } from '../../../core/utils/wc-dnd/dnd-context.js';
import { defaultActivators } from '../../../core/utils/wc-dnd/sensors/index.js';
import { linearMove } from '../../../core/utils/wc-dnd/utils/linear-move.js';
import {
  DataViewUIBase,
  DataViewUILogicBase,
} from '../../../core/view/data-view-base.js';
import type { TableViewSelectionWithType } from '../selection';
import type { TableSingleView } from '../table-view-manager.js';
import {
  getTableViewportStyle,
  renderTableViewportResizeHandle,
  tableStickyColumnHeaderStyle,
  TableViewportResizeController,
  tableViewportWrapperStyle,
} from '../table-viewport.js';
import { handleTableWheel } from '../utils.js';
import { TableClipboardController } from './controller/clipboard.js';
import { TableDragController } from './controller/drag.js';
import { TableHotkeysController } from './controller/hotkeys.js';
import { TableSelectionController } from './controller/selection.js';
import { DataViewColumnPreview } from './header/column-renderer.js';
import { getVerticalIndicator } from './header/vertical-indicator.js';
import {
  addGroupIconStyle,
  addGroupStyle,
  groupsHiddenMessageStyle,
  tableGroupsContainerStyle,
  tableScrollContainerStyle,
  tableViewStyle,
  tableWrapperStyle,
} from './table-view-style';

export class TableViewUILogic extends DataViewUILogicBase<
  TableSingleView,
  TableViewSelectionWithType
> {
  ui$ = signal<TableViewUI>();
  scrollContainer$ = signal<HTMLDivElement>();
  tableContainer$ = signal<HTMLDivElement>();

  clipboardController = new TableClipboardController(this);
  dragController = new TableDragController(this);
  hotkeysController = new TableHotkeysController(this);
  selectionController = new TableSelectionController(this);
  viewportResizeController = new TableViewportResizeController(this.view);

  private get readonly() {
    return this.view.readonly$.value;
  }

  clearSelection = () => {
    this.selectionController.clear();
  };

  addRow = (position: InsertToPosition) => {
    if (this.readonly) return;
    const rowId = this.view.rowAdd(position);
    if (rowId) {
      this.root.openDetailPanel({
        view: this.view,
        rowId,
      });
    }
    return rowId;
  };

  focusFirstCell = () => {
    this.selectionController.focusFirstCell();
  };

  showIndicator = (evt: MouseEvent) => {
    return this.dragController.showIndicator(evt) != null;
  };

  hideIndicator = () => {
    this.dragController.dropPreview.remove();
  };

  moveTo = (id: string, evt: MouseEvent) => {
    const result = this.dragController.getInsertPosition(evt);
    if (result) {
      const row = this.view.rowGetOrCreate(id);
      row.move(result.position, undefined, result.groupKey);
    }
  };

  onWheel = handleTableWheel;

  renderAddGroup = (groupHelper: GroupTrait) => {
    const addGroup = groupHelper.addGroup;
    if (!addGroup) {
      return;
    }
    const add = (e: MouseEvent) => {
      const ele = e.currentTarget as HTMLElement;
      popMenu(popupTargetFromElement(ele), {
        options: {
          items: [
            menu.input({
              onComplete: text => {
                const column = groupHelper.property$.value;
                if (column) {
                  column.dataUpdate(() =>
                    addGroup({
                      text,
                      oldData: column.data$.value,
                      dataSource: this.view.manager.dataSource,
                    })
                  );
                }
              },
            }),
          ],
        },
      });
    };
    return html` <div style="display:flex;">
      <div class="${addGroupStyle}" @click="${add}">
        <div class="${addGroupIconStyle}">${AddCursorIcon()}</div>
        <div>New Group</div>
      </div>
    </div>`;
  };

  renderer = createUniComponentFromWebComponent(TableViewUI);
}

export class TableViewUI extends DataViewUIBase<TableViewUILogic> {
  columnDndContext = createDndContext({
    activators: defaultActivators,
    container: this,
    modifiers: [
      ({ transform }) => {
        return {
          ...transform,
          y: 0,
        };
      },
    ],
    onDragEnd: ({ over, active }) => {
      if (over && over.id !== active.id) {
        const view = this.logic.view;
        const activeIndex = view.properties$.value.findIndex(
          data => data.id === active.id
        );
        const overIndex = view.properties$.value.findIndex(
          data => data.id === over.id
        );
        view.propertyGetOrCreate(active.id).move({
          before: activeIndex > overIndex,
          id: over.id,
        });
      }
    },
    collisionDetection: linearMove(true),
    createOverlay: active => {
      const column = this.logic.view.propertyGetOrCreate(active.id);
      const preview = new DataViewColumnPreview();
      preview.column = column;
      preview.container = this.logic.tableContainer$.value ?? this;
      preview.tableViewLogic = this.logic;
      preview.style.position = 'absolute';
      preview.style.zIndex = '999';
      const scale = this.columnDndContext.scale$.value;
      const offsetParentRect = this.offsetParent?.getBoundingClientRect();
      if (!offsetParentRect) {
        return;
      }
      preview.style.width = `${column.width$.value}px`;
      preview.style.top = `${(active.rect.top - offsetParentRect.top - 1) / scale.y}px`;
      preview.style.left = `${(active.rect.left - offsetParentRect.left) / scale.x}px`;
      const cells = Array.from(
        this.querySelectorAll(`[data-column-id="${active.id}"]`)
      ) as HTMLElement[];
      cells.forEach(ele => {
        ele.style.opacity = '0.1';
      });
      this.append(preview);
      return {
        overlay: preview,
        cleanup: () => {
          preview.remove();
          cells.forEach(ele => {
            ele.style.opacity = '1';
          });
        },
      };
    },
  });

  override connectedCallback(): void {
    super.connectedCallback();
    this.logic.ui$.value = this;
    this.logic.clipboardController.hostConnected();
    this.logic.dragController.hostConnected();
    this.logic.hotkeysController.hostConnected();
    this.logic.selectionController.hostConnected();
    this.classList.add('affine-database-table', tableViewStyle);
    this.dataset['testid'] = 'dv-table-view';
    this.disposables.add(
      effect(() => {
        const active = this.columnDndContext.active$.value;
        const over = this.columnDndContext.over$.value;
        const columnMoveIndicator = getVerticalIndicator();
        if (!active || !over) {
          columnMoveIndicator.remove();
          return;
        }
        const scrollX = this.columnDndContext.scrollOffset$.value.x;
        const bottom =
          this.logic.tableContainer$.value?.getBoundingClientRect().bottom ??
          this.getBoundingClientRect().bottom;
        const left =
          over.rect.left < active.rect.left ? over.rect.left : over.rect.right;
        const height = bottom - over.rect.top;
        columnMoveIndicator.display(left - scrollX, over.rect.top, height);
      })
    );
  }

  private renderTable() {
    const groups = this.logic.view.groupTrait.groupsDataList$.value?.filter(
      (g): g is Group => g !== undefined
    );
    if (groups && groups.length) {
      return html`
        <div class="${tableGroupsContainerStyle}">
          ${repeat(
            groups,
            group => group.key,
            group =>
              html`<affine-data-view-table-group
                data-group-key="${group.key}"
                .tableViewLogic="${this.logic}"
                .group="${group}"
              ></affine-data-view-table-group>`
          )}
          ${this.logic.renderAddGroup(this.logic.view.groupTrait)}
        </div>
      `;
    }
    return html`<affine-data-view-table-group
      .tableViewLogic="${this.logic}"
    ></affine-data-view-table-group>`;
  }

  override render(): TemplateResult {
    const vPadding = this.logic.root.config.virtualPadding$.value;
    const wrapperStyle = styleMap({
      marginLeft: `-${vPadding}px`,
      marginRight: `-${vPadding}px`,
    });
    const containerStyle = styleMap({
      paddingLeft: `${vPadding}px`,
      paddingRight: `${vPadding}px`,
    });
    const viewportHeight =
      this.logic.viewportResizeController.effectiveHeight$.value;
    const viewportStyle = getTableViewportStyle(viewportHeight);
    return html`
      ${this.logic.headerWidget
        ? renderUniLit(this.logic.headerWidget, {
            dataViewLogic: this.logic,
          })
        : ''}
      <div class="${tableWrapperStyle}" style="${wrapperStyle}">
        <div class="${tableViewportWrapperStyle}">
          <div
            ${ref(this.logic.scrollContainer$)}
            class="${tableScrollContainerStyle}"
            style="${viewportStyle}"
            @wheel="${this.logic.onWheel}"
          >
            <div
              class="${tableStickyColumnHeaderStyle}"
              style="${containerStyle}"
            >
              <affine-database-column-header
                .tableViewLogic="${this.logic}"
              ></affine-database-column-header>
            </div>
            <div
              ${ref(this.logic.tableContainer$)}
              class="affine-database-table-container"
              style="${containerStyle}"
            >
              ${this.logic.view.groupTrait.allHidden$.value
                ? html`<div class="${groupsHiddenMessageStyle}">
                    All groups are hidden
                  </div>`
                : this.renderTable()}
            </div>
          </div>
          ${renderTableViewportResizeHandle(
            this.logic.viewportResizeController,
            this.logic.view.readonly$.value
          )}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dv-table-view-ui': TableViewUI;
  }
}
