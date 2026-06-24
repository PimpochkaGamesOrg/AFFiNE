import {
  createPopup,
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import type {
  ButtonAction,
  ButtonAddPageAction,
  ButtonAutomationConfig,
  ButtonBlockModel,
  ButtonConfirmAction,
  ButtonCreateGoogleDriveFoldersAction,
  ButtonEditAction,
  ButtonValueExpression,
  GoogleDriveFoldersUrlField,
} from '@blocksuite/affine-model';
import { DeleteIcon, PlusIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Workspace } from '@blocksuite/store';
import { cssVarV2 } from '@toeverything/theme/v2';
import { html, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  cloneConfig,
  createEmptyAddPageAction,
  createEmptyColorCharactersAction,
  createEmptyConfirmAction,
  createEmptyCreateGoogleDriveFoldersAction,
  createEmptyEditAction,
  getWorkspaceDatabases,
  type WorkspaceDatabase,
} from '../automation/config-helpers.js';
import { ButtonDatabaseSelect } from './database-select.js';
import { ButtonFormulaEditor } from './formula-editor.js';

const panelStyle = `
  width: 520px;
  max-height: 85vh;
  overflow: auto;
  padding: 20px;
  border-radius: 14px;
  background: ${cssVarV2.layer.background.primary};
  color: ${cssVarV2.text.primary};
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
`;

const labelStyle = `
  opacity: 0.65;
  font-size: 12px;
  margin-bottom: 6px;
`;

const actionCardStyle = `
  border: 1px solid ${cssVarV2.layer.insideBorder.border};
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  background: ${cssVarV2.layer.background.secondary};
`;

const headerRowStyle = `
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const actionTagStyle = `
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: ${cssVarV2.button.primary};
  margin-bottom: 4px;
`;

const inputStyle = `
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid ${cssVarV2.layer.insideBorder.border};
  background: ${cssVarV2.input.background};
  color: ${cssVarV2.text.primary};
  font-size: 13px;
`;

const smallBtnStyle = `
  border: 1px solid ${cssVarV2.layer.insideBorder.border};
  background: ${cssVarV2.layer.background.primary};
  color: ${cssVarV2.text.primary};
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
`;

const saveBtnStyle = `
  width: 100%;
  border: none;
  background: ${cssVarV2.button.primary};
  color: ${cssVarV2.button.pureWhite()};
  border-radius: 10px;
  padding: 12px 16px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  margin-top: 8px;
`;

const addActionBtnStyle = `
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  color: ${cssVarV2.text.secondary};
  border-radius: 8px;
  padding: 6px 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
`;

const propertyRowStyle = `
  display: grid;
  grid-template-columns: 140px 1fr auto;
  gap: 8px;
  align-items: start;
  margin-bottom: 10px;
`;

type PropertyRow = {
  id: string;
  name: string;
  value: ButtonValueExpression;
};

let rowIdCounter = 0;
const nextRowId = () => `row-${++rowIdCounter}`;

function rowsFromProperties(
  properties: Record<string, ButtonValueExpression>
): PropertyRow[] {
  return Object.entries(properties).map(([name, value]) => ({
    id: nextRowId(),
    name,
    value,
  }));
}

function propertiesFromRows(rows: PropertyRow[]) {
  const result: Record<string, ButtonValueExpression> = {};
  rows.forEach(row => {
    const name = row.name.trim();
    if (!name) return;
    result[name] = row.value;
  });
  return result;
}

export class ButtonConfigPanel extends ShadowlessElement {
  @property({ attribute: false })
  accessor model: ButtonBlockModel | undefined;

  @property({ attribute: false })
  accessor workspace: Workspace | undefined;

  @property({ attribute: false })
  accessor initialConfig: ButtonAutomationConfig | undefined;

  @property({ attribute: false })
  accessor onSave!: (config: ButtonAutomationConfig) => void;

  @state()
  private accessor _draft: ButtonAutomationConfig | null = null;

  @state()
  private accessor _propertyRows = new Map<number, PropertyRow[]>();

  @state()
  private accessor _editRows = new Map<number, PropertyRow[]>();

  private get draft(): ButtonAutomationConfig {
    return this._draft!;
  }

  private set draft(value: ButtonAutomationConfig) {
    this._draft = value;
  }

  protected override willUpdate(_changed: PropertyValues<this>) {
    if (this._draft) return;
    if (this.initialConfig) {
      this._draft = cloneConfig(this.initialConfig);
      return;
    }
    if (this.model) {
      this._draft = cloneConfig(this.model.props.automation);
    }
  }

  private get databases(): WorkspaceDatabase[] {
    const workspace = this.model?.store.workspace ?? this.workspace;
    if (!workspace) return [];
    return getWorkspaceDatabases(workspace);
  }

  private _ensureRowCache() {
    this.draft.actions.forEach((action, index) => {
      if (action.type === 'add_page' && !this._propertyRows.has(index)) {
        this._propertyRows = new Map(this._propertyRows).set(
          index,
          rowsFromProperties(action.properties)
        );
      }
      if (action.type === 'edit' && !this._editRows.has(index)) {
        this._editRows = new Map(this._editRows).set(
          index,
          rowsFromProperties(action.properties)
        );
      }
    });
  }

  private _updateDraft(updater: (draft: ButtonAutomationConfig) => void) {
    const next = cloneConfig(this.draft);
    updater(next);
    this.draft = next;
    this._ensureRowCache();
  }

  private _updateAction(
    index: number,
    updater: (action: ButtonAction) => void
  ) {
    this._updateDraft(draft => {
      const action = draft.actions[index];
      if (!action) return;
      updater(action);
    });
  }

  private _openAddActionMenu(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    const hasDatabases = this.databases.length > 0;
    popMenu(popupTargetFromElement(target), {
      options: {
        items: [
          menu.action({
            name: 'Show confirmation',
            select: () => {
              this._addAction('confirm');
            },
          }),
          menu.action({
            name: 'Add page to',
            hide: () => !hasDatabases,
            select: () => {
              this._addAction('add_page');
            },
          }),
          menu.action({
            name: 'Edit this page',
            select: () => {
              this._addAction('edit');
            },
          }),
          menu.action({
            name: 'Color characters',
            select: () => {
              this._addAction('color_characters');
            },
          }),
          menu.action({
            name: 'Create Google Drive folders',
            select: () => {
              this._addAction('create_google_drive_folders');
            },
          }),
        ],
      },
    });
  }

  private _addAction(type: ButtonAction['type']) {
    this._updateDraft(draft => {
      const index = draft.actions.length;
      if (type === 'confirm') {
        draft.actions.push(createEmptyConfirmAction());
        return;
      }
      if (type === 'add_page') {
        const action = createEmptyAddPageAction(this.databases[0]);
        draft.actions.push(action);
        this._propertyRows = new Map(this._propertyRows).set(
          index,
          rowsFromProperties(action.properties)
        );
        return;
      }
      if (type === 'color_characters') {
        draft.actions.push(createEmptyColorCharactersAction());
        return;
      }
      if (type === 'create_google_drive_folders') {
        draft.actions.push(createEmptyCreateGoogleDriveFoldersAction());
        return;
      }
      const editAction = createEmptyEditAction();
      draft.actions.push(editAction);
      this._editRows = new Map(this._editRows).set(
        index,
        rowsFromProperties(editAction.properties)
      );
    });
  }

  private _removeAction(index: number) {
    const nextPropertyRows = new Map(this._propertyRows);
    nextPropertyRows.delete(index);
    this._propertyRows = nextPropertyRows;
    const nextEditRows = new Map(this._editRows);
    nextEditRows.delete(index);
    this._editRows = nextEditRows;
    this._updateDraft(draft => {
      draft.actions.splice(index, 1);
    });
  }

  private _getPropertyRows(index: number, action: ButtonAddPageAction) {
    if (!this._propertyRows.has(index)) {
      this._propertyRows = new Map(this._propertyRows).set(
        index,
        rowsFromProperties(action.properties)
      );
    }
    return this._propertyRows.get(index)!;
  }

  private _getEditRows(index: number, action: ButtonEditAction) {
    if (!this._editRows.has(index)) {
      this._editRows = new Map(this._editRows).set(
        index,
        rowsFromProperties(action.properties)
      );
    }
    return this._editRows.get(index)!;
  }

  private _propertiesEqual(
    left: Record<string, ButtonValueExpression>,
    right: Record<string, ButtonValueExpression>
  ) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private _syncPropertyRows(index: number, rows: PropertyRow[]) {
    this._propertyRows = new Map(this._propertyRows).set(index, rows);
    const nextProperties = propertiesFromRows(rows);
    const action = this.draft.actions[index];
    if (action?.type !== 'add_page') return;
    if (this._propertiesEqual(action.properties, nextProperties)) return;
    this._updateAction(index, act => {
      (act as ButtonAddPageAction).properties = nextProperties;
    });
  }

  private _syncEditRows(index: number, rows: PropertyRow[]) {
    this._editRows = new Map(this._editRows).set(index, rows);
    const nextProperties = propertiesFromRows(rows);
    const action = this.draft.actions[index];
    if (action?.type !== 'edit') return;
    if (this._propertiesEqual(action.properties, nextProperties)) return;
    this._updateAction(index, act => {
      (act as ButtonEditAction).properties = nextProperties;
    });
  }

  private _renderSourceDatabaseSelect() {
    const draft = this.draft;
    const selectedKey = draft.sourceDatabase
      ? `${draft.sourceDatabase.databaseDocId}:${draft.sourceDatabase.databaseBlockId}`
      : '';
    return html`
      <div style="margin-bottom: 16px;">
        <div style=${labelStyle}>Source database</div>
        <affine-button-database-select
          .databases=${this.databases}
          .selectedKey=${selectedKey}
          placeholder="Select source database"
          .onSelect=${(db: WorkspaceDatabase) => {
            this._updateDraft(d => {
              d.sourceDatabase = {
                databaseDocId: db.databaseDocId,
                databaseBlockId: db.databaseBlockId,
                databaseName: db.name,
              };
              d.source = undefined;
            });
          }}
        ></affine-button-database-select>
        <div style="opacity:0.55;font-size:11px;margin-top:4px;">
          This button is shown only on pages linked from the selected database.
        </div>
      </div>
    `;
  }

  private _renderDatabaseSelect(action: ButtonAddPageAction, index: number) {
    const selectedKey =
      action.databaseDocId && action.databaseBlockId
        ? `${action.databaseDocId}:${action.databaseBlockId}`
        : '';
    return html`
      <div style="margin-bottom: 12px;">
        <div style=${actionTagStyle}>Add page to</div>
        <affine-button-database-select
          .databases=${this.databases}
          .selectedKey=${selectedKey}
          placeholder="Select database"
          .onSelect=${(db: WorkspaceDatabase) => {
            this._updateAction(index, act => {
              const add = act as ButtonAddPageAction;
              add.databaseDocId = db.databaseDocId;
              add.databaseBlockId = db.databaseBlockId;
              add.databaseName = db.name;
            });
          }}
        ></affine-button-database-select>
        <div style="opacity:0.55;font-size:11px;margin-top:4px;">as Empty</div>
      </div>
    `;
  }

  private _getPreviousAddPageSteps(beforeIndex: number): number[] {
    return this.draft.actions
      .slice(0, beforeIndex)
      .map((action, index) => ({ action, step: index + 1 }))
      .filter(({ action }) => action.type === 'add_page')
      .map(({ step }) => step);
  }

  private _renderPropertyRows(
    rows: PropertyRow[],
    sync: (rows: PropertyRow[]) => void,
    addPageSteps: number[]
  ) {
    return html`
      ${repeat(
        rows,
        row => row.id,
        row => html`
          <div style=${propertyRowStyle}>
            <input
              style=${inputStyle}
              placeholder="Property"
              .value=${row.name}
              @input=${(e: Event) => {
                const name = (e.target as HTMLInputElement).value;
                sync(
                  rows.map(item =>
                    item.id === row.id ? { ...item, name } : item
                  )
                );
              }}
            />
            <affine-button-formula-editor
              .value=${row.value}
              .addPageSteps=${addPageSteps}
              placeholder="Value formula"
              .onChange=${(value: ButtonValueExpression) => {
                sync(
                  rows.map(item =>
                    item.id === row.id ? { ...item, value } : item
                  )
                );
              }}
            ></affine-button-formula-editor>
            <button
              style="${smallBtnStyle};padding:6px;"
              @click=${() => sync(rows.filter(item => item.id !== row.id))}
            >
              ${DeleteIcon({ width: '14px', height: '14px' })}
            </button>
          </div>
        `
      )}
      <button
        type="button"
        style="${smallBtnStyle};display:inline-flex;align-items:center;gap:4px;"
        @click=${(e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          sync([
            ...rows,
            {
              id: nextRowId(),
              name: '',
              value: { type: 'this_page' },
            },
          ]);
        }}
      >
        ${PlusIcon({ width: '14px', height: '14px' })} Edit property
      </button>
    `;
  }

  private _renderConfirm(action: ButtonConfirmAction, index: number) {
    return html`
      <div style=${actionCardStyle}>
        <div style=${headerRowStyle}>
          <div>
            <div style=${actionTagStyle}>Show confirmation</div>
            <div style="font-size:13px;font-weight:600;">
              Confirmation message
            </div>
          </div>
          <button
            style=${smallBtnStyle}
            @click=${() => this._removeAction(index)}
          >
            Remove
          </button>
        </div>

        <affine-button-formula-editor
          .value=${action.message}
          .addPageSteps=${this._getPreviousAddPageSteps(index)}
          placeholder='e.g. if(empty(This page.Field), "Continue?", "Already set?")'
          .onChange=${(value: ButtonValueExpression) => {
            this._updateAction(index, act => {
              (act as ButtonConfirmAction).message = value;
            });
          }}
        ></affine-button-formula-editor>

        <div
          style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;"
        >
          <div>
            <div style=${labelStyle}>Continue button text</div>
            <input
              style=${inputStyle}
              .value=${action.continueText}
              @input=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                this._updateAction(index, act => {
                  (act as ButtonConfirmAction).continueText = value;
                });
              }}
            />
          </div>
          <div>
            <div style=${labelStyle}>Cancel button text</div>
            <input
              style=${inputStyle}
              .value=${action.cancelText}
              @input=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                this._updateAction(index, act => {
                  (act as ButtonConfirmAction).cancelText = value;
                });
              }}
            />
          </div>
        </div>
      </div>
    `;
  }

  private _renderAddPage(action: ButtonAddPageAction, index: number) {
    const rows = this._getPropertyRows(index, action);
    return html`
      <div style=${actionCardStyle}>
        <div style=${headerRowStyle}>
          <div style="font-size:13px;font-weight:600;">Step ${index + 1}</div>
          <button
            style=${smallBtnStyle}
            @click=${() => this._removeAction(index)}
          >
            Remove
          </button>
        </div>
        ${this._renderDatabaseSelect(action, index)}
        ${this._renderPropertyRows(
          rows,
          r => this._syncPropertyRows(index, r),
          this._getPreviousAddPageSteps(index)
        )}
      </div>
    `;
  }

  private _renderEdit(action: ButtonEditAction, index: number) {
    const rows = this._getEditRows(index, action);
    return html`
      <div style=${actionCardStyle}>
        <div style=${headerRowStyle}>
          <div>
            <div style=${actionTagStyle}>Edit</div>
            <div style="font-size:13px;font-weight:600;">This page</div>
          </div>
          <button
            style=${smallBtnStyle}
            @click=${() => this._removeAction(index)}
          >
            Remove
          </button>
        </div>
        ${this._renderPropertyRows(
          rows,
          r => this._syncEditRows(index, r),
          this._getPreviousAddPageSteps(index)
        )}
      </div>
    `;
  }

  private _renderColorCharacters(index: number) {
    return html`
      <div style=${actionCardStyle}>
        <div style=${headerRowStyle}>
          <div>
            <div style=${actionTagStyle}>Color characters</div>
            <div style="font-size:13px;font-weight:600;">Scenario dialogue</div>
          </div>
          <button
            style=${smallBtnStyle}
            @click=${() => this._removeAction(index)}
          >
            Remove
          </button>
        </div>
        <div style="opacity:0.55;font-size:12px;">
          Colors dialogue blocks on this page. Main characters use fixed colors;
          others get a free palette color.
        </div>
      </div>
    `;
  }

  private _renderCreateGoogleDriveFolders(
    action: ButtonCreateGoogleDriveFoldersAction,
    index: number
  ) {
    const addPageSteps = this._getPreviousAddPageSteps(index);
    return html`
      <div style=${actionCardStyle}>
        <div style=${headerRowStyle}>
          <div>
            <div style=${actionTagStyle}>Google Drive</div>
            <div style="font-size:13px;font-weight:600;">
              Create episode folders
            </div>
          </div>
          <button
            style=${smallBtnStyle}
            @click=${() => this._removeAction(index)}
          >
            Remove
          </button>
        </div>

        <div style="margin-bottom:12px;">
          <div style=${labelStyle}>Episode title</div>
          <affine-button-formula-editor
            .value=${action.episodeTitle}
            .addPageSteps=${addPageSteps}
            placeholder="e.g. Name"
            .onChange=${(value: ButtonValueExpression) => {
              this._updateAction(index, act => {
                (act as ButtonCreateGoogleDriveFoldersAction).episodeTitle =
                  value;
              });
            }}
          ></affine-button-formula-editor>
        </div>

        <div style="margin-bottom:12px;">
          <div style=${labelStyle}>Category (rubric)</div>
          <affine-button-formula-editor
            .value=${action.categoryName}
            .addPageSteps=${addPageSteps}
            placeholder='e.g. if(empty(Рубрика), "Без рубрики", Рубрика)'
            .onChange=${(value: ButtonValueExpression) => {
              this._updateAction(index, act => {
                (act as ButtonCreateGoogleDriveFoldersAction).categoryName =
                  value;
              });
            }}
          ></affine-button-formula-editor>
        </div>

        <div style="margin-bottom:12px;">
          <div style=${labelStyle}>Parent folder ID (optional)</div>
          <affine-button-formula-editor
            .value=${action.parentFolderId ?? { type: 'literal', value: '' }}
            .addPageSteps=${addPageSteps}
            placeholder="Override root series folder ID"
            .onChange=${(value: ButtonValueExpression) => {
              this._updateAction(index, act => {
                const drive = act as ButtonCreateGoogleDriveFoldersAction;
                if (value.type === 'literal' && !value.value.trim()) {
                  drive.parentFolderId = undefined;
                  return;
                }
                drive.parentFolderId = value;
              });
            }}
          ></affine-button-formula-editor>
        </div>

        <div
          style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;"
        >
          <div>
            <div style=${labelStyle}>Write link to property</div>
            <input
              style=${inputStyle}
              .value=${action.targetProperty}
              placeholder="Google Drive"
              @input=${(e: Event) => {
                const value = (e.target as HTMLInputElement).value;
                this._updateAction(index, act => {
                  (act as ButtonCreateGoogleDriveFoldersAction).targetProperty =
                    value;
                });
              }}
            />
          </div>
          <div>
            <div style=${labelStyle}>Link from response</div>
            <select
              style=${inputStyle}
              .value=${action.resultUrlField ?? 'episodeFolderUrl'}
              @change=${(e: Event) => {
                const value = (e.target as HTMLSelectElement)
                  .value as GoogleDriveFoldersUrlField;
                this._updateAction(index, act => {
                  (act as ButtonCreateGoogleDriveFoldersAction).resultUrlField =
                    value;
                });
              }}
            >
              <option value="episodeFolderUrl">Episode folder</option>
              <option value="categoryFolderUrl">Category folder</option>
            </select>
          </div>
        </div>

        <div style="opacity:0.55;font-size:12px;">
          Uses Google OAuth from admin settings and creates folders directly via
          Google Drive API. On first run you will be asked to authorize Drive
          access; tokens are stored on the server until they expire.
        </div>
      </div>
    `;
  }

  private _renderAction(action: ButtonAction, index: number) {
    if (action.type === 'confirm') return this._renderConfirm(action, index);
    if (action.type === 'add_page') return this._renderAddPage(action, index);
    if (action.type === 'color_characters') {
      return this._renderColorCharacters(index);
    }
    if (action.type === 'create_google_drive_folders') {
      return this._renderCreateGoogleDriveFolders(action, index);
    }
    return this._renderEdit(action, index);
  }

  override render() {
    this._ensureRowCache();
    const draft = this.draft;
    const hasDatabases = this.databases.length > 0;

    return html`
      <div style=${panelStyle}>
        <input
          style="${inputStyle};font-size:18px;font-weight:600;margin-bottom:16px;"
          .value=${draft.label}
          placeholder="Button label"
          @input=${(e: Event) => {
            const value = (e.target as HTMLInputElement).value;
            this._updateDraft(d => {
              d.label = value;
            });
          }}
        />

        ${this._renderSourceDatabaseSelect()}

        <div style="${labelStyle};margin-bottom:12px;">When</div>
        <div style="font-size:14px;font-weight:600;margin-bottom:16px;">
          Button is clicked
        </div>

        <div style="${labelStyle};margin-bottom:8px;">Do</div>

        ${repeat(
          draft.actions,
          (_, index) => index,
          (action, index) => this._renderAction(action, index)
        )}
        ${draft.actions.length === 0
          ? html`<div style="opacity:0.55;font-size:12px;margin-bottom:12px;">
              Add steps below. Pick any database and map properties with
              formulas.
            </div>`
          : nothing}
        ${!hasDatabases
          ? html`<div
              style="opacity:0.7;font-size:12px;margin-bottom:12px;color:${cssVarV2
                .status.warning};"
            >
              Create at least one database in workspace to use "Add page to".
            </div>`
          : nothing}

        <button
          type="button"
          style=${addActionBtnStyle}
          @click=${this._openAddActionMenu}
        >
          ${PlusIcon({ width: '14px', height: '14px' })} Add action
        </button>

        <button
          style=${saveBtnStyle}
          @click=${() => {
            this.onSave(this.draft);
            this._draft = null;
            this._propertyRows = new Map();
            this._editRows = new Map();
          }}
        >
          Save
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-button-config-panel': ButtonConfigPanel;
  }
}

function definePanelElement(
  name: string,
  constructor: CustomElementConstructor
) {
  if (!customElements.get(name)) {
    customElements.define(name, constructor);
  }
}

function ensureConfigPanelElements() {
  definePanelElement('affine-button-config-panel', ButtonConfigPanel);
  definePanelElement('affine-button-database-select', ButtonDatabaseSelect);
  definePanelElement('affine-button-formula-editor', ButtonFormulaEditor);
}

export function openButtonConfigPanel(
  model: ButtonBlockModel,
  anchor: HTMLElement,
  onSave: (config: ButtonAutomationConfig) => void
) {
  openButtonAutomationConfigPanel({
    anchor,
    workspace: model.store.workspace,
    config: model.props.automation,
    onSave,
  });
}

export function openButtonAutomationConfigPanel(options: {
  anchor: HTMLElement;
  workspace: Workspace;
  config: ButtonAutomationConfig;
  onSave: (config: ButtonAutomationConfig) => boolean | void;
}) {
  ensureConfigPanelElements();
  const panel = document.createElement(
    'affine-button-config-panel'
  ) as ButtonConfigPanel;
  panel.workspace = options.workspace;
  panel.initialConfig = options.config;
  panel.style.position = 'absolute';
  const closePopup = createPopup(
    popupTargetFromElement(options.anchor),
    panel,
    {
      onClose: () => panel.remove(),
    }
  );
  panel.onSave = config => {
    const saved = options.onSave(config);
    if (saved === false) return;
    closePopup();
  };
}
