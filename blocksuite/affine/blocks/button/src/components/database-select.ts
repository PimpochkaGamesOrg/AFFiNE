import {
  type FilterableListItem,
  showPopFilterableList,
} from '@blocksuite/affine-components/filterable-list';
import { ArrowDownIcon } from '@blocksuite/affine-components/icons';
import { ShadowlessElement } from '@blocksuite/std';
import { cssVarV2 } from '@toeverything/theme/v2';
import { html } from 'lit';
import { property, query } from 'lit/decorators.js';

import type { WorkspaceDatabase } from '../automation/config-helpers.js';

const triggerStyle = `
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid ${cssVarV2.layer.insideBorder.border};
  background: ${cssVarV2.input.background};
  color: ${cssVarV2.text.primary};
  font-size: 13px;
  cursor: pointer;
  text-align: left;
`;

const triggerIconStyle = `
  display: flex;
  align-items: center;
  color: ${cssVarV2.icon.primary};
  flex-shrink: 0;
`;

function databaseKey(db: WorkspaceDatabase) {
  return `${db.databaseDocId}:${db.databaseBlockId}`;
}

export class ButtonDatabaseSelect extends ShadowlessElement {
  @property({ attribute: false })
  accessor databases: WorkspaceDatabase[] = [];

  @property({ attribute: false })
  accessor selectedKey = '';

  @property({ attribute: false })
  accessor placeholder = 'Select database';

  @property({ attribute: false })
  accessor onSelect: ((db: WorkspaceDatabase) => void) | undefined;

  @query('.database-select-trigger')
  private accessor _trigger!: HTMLButtonElement;

  private _abortController?: AbortController;

  private _openList() {
    if (this._abortController) {
      this._abortController.abort();
      return;
    }
    if (!this.databases.length) return;

    this._abortController = new AbortController();
    this._abortController.signal.addEventListener('abort', () => {
      this._abortController = undefined;
    });

    const items: FilterableListItem<WorkspaceDatabase>[] = this.databases.map(
      db => ({
        name: databaseKey(db),
        label: db.name || 'Untitled database',
        props: db,
      })
    );

    showPopFilterableList({
      referenceElement: this._trigger,
      abortController: this._abortController,
      options: {
        placeholder: 'Search databases',
        items,
        active: item => item.name === this.selectedKey,
        onSelect: item => {
          if (!item.props) return;
          this.onSelect?.(item.props);
        },
      },
      portalStyles: {
        zIndex: 'var(--affine-z-index-popover)',
      },
    });
  }

  override render() {
    const selected = this.databases.find(
      db => databaseKey(db) === this.selectedKey
    );
    const label = selected?.name || this.placeholder;
    const isPlaceholder = !selected;

    return html`
      <button
        type="button"
        class="database-select-trigger"
        style="${triggerStyle}${isPlaceholder ? 'opacity:0.65;' : ''}"
        @click=${(e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          this._openList();
        }}
      >
        <span>${label}</span>
        <span style=${triggerIconStyle}>
          ${ArrowDownIcon({ width: '16px', height: '16px' })}
        </span>
      </button>
    `;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._abortController?.abort();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-button-database-select': ButtonDatabaseSelect;
  }
}
