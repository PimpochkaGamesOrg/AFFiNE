import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { signal } from '@preact/signals-core';
import { css } from 'lit';
import { property } from 'lit/decorators.js';
import { html } from 'lit/static-html.js';

import type { CellRenderProps } from '../../../core/property/index.js';
import { renderUniLit } from '../../../core/utils/uni-component/uni-component.js';
import type { Property } from '../../../core/view-manager/property.js';

const styles = css`
  affine-data-view-calendar-card-property {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 18px;
    pointer-events: none;
  }

  affine-data-view-calendar-card-property .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    height: 18px;
    color: var(--affine-icon-secondary);
  }

  affine-data-view-calendar-card-property .icon svg {
    width: 14px;
    height: 14px;
    fill: var(--affine-icon-secondary);
    color: var(--affine-icon-secondary);
  }

  affine-data-view-calendar-card-property .calendar-card-property-cell {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    font-size: 11px;
    line-height: 16px;
  }
`;

/**
 * Read-only property value on a calendar card (Notion-style).
 * Clicks pass through to the card so the detail panel still opens.
 */
export class CalendarCardProperty extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private readonly isEditing$ = signal(false);

  private readonly selectCurrentCell = (_editing: boolean) => {};

  override render() {
    const renderer = this.column.renderer$.value;
    if (!renderer) {
      const value = this.column.stringValueGet(this.rowId);
      if (!value) return;
      return html`<span class="calendar-card-property-cell">${value}</span>`;
    }
    const props: CellRenderProps = {
      cell: this.column.cellGetOrCreate(this.rowId),
      isEditing$: this.isEditing$,
      selectCurrentCell: this.selectCurrentCell,
    };
    return html`
      <uni-lit class="icon" .uni="${this.column.icon}"></uni-lit>
      ${renderUniLit(renderer.view, props, {
        class: 'calendar-card-property-cell',
        style: {
          display: 'block',
          flex: '1',
          minWidth: '0',
          overflow: 'hidden',
        },
      })}
    `;
  }

  @property({ attribute: false })
  accessor column!: Property;

  @property({ attribute: false })
  accessor rowId!: string;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-calendar-card-property': CalendarCardProperty;
  }
}
