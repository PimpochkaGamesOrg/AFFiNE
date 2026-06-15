import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { PlusIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { nothing, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import { cellDivider } from '../../styles.js';
import { tableStyle } from '../table-view-style';
import { type TableViewUILogic } from '../table-view-ui-logic.js';
import { styles } from './styles.js';

export class DatabaseColumnHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private readonly _onAddColumn = (e: MouseEvent) => {
    if (this.readonly) return;
    this.tableViewManager.propertyAdd('end');
    const ele = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => {
      this.editLastColumnTitle();
      ele.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  editLastColumnTitle = () => {
    const columns = this.querySelectorAll('affine-database-header-column');
    const column = columns.item(columns.length - 1);
    column.editTitle();
  };

  private get readonly() {
    return this.tableViewManager.readonly$.value;
  }

  override render() {
    return html`
      ${this.renderGroupHeader?.()}
      <div class="affine-database-column-header database-row">
        ${this.readonly
          ? nothing
          : html`<div class="${tableStyle.leftToolBarStyle}"></div>`}
        ${repeat(
          this.tableViewManager.properties$.value,
          column => column.id,
          (column, index) => {
            const style = styleMap({
              width: `${column.width$.value}px`,
              border: index === 0 ? 'none' : undefined,
            });
            return html`
              <affine-database-header-column
                style="${style}"
                data-column-id="${column.id}"
                data-column-index="${index}"
                class="affine-database-column database-cell"
                .column="${column}"
                .tableViewLogic="${this.tableViewLogic}"
              ></affine-database-header-column>
              <div class="${cellDivider}" style="height: auto;"></div>
            `;
          }
        )}
        <div
          @click="${this._onAddColumn}"
          class="header-add-column-button dv-hover"
        >
          ${PlusIcon()}
        </div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor renderGroupHeader: (() => TemplateResult) | undefined;

  @property({ attribute: false })
  accessor tableViewLogic!: TableViewUILogic;

  get tableViewManager() {
    return this.tableViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-column-header': DatabaseColumnHeader;
  }
}
