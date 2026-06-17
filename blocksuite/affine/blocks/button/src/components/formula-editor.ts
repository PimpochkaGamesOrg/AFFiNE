import type { ButtonValueExpression } from '@blocksuite/affine-model';
import { ShadowlessElement } from '@blocksuite/std';
import { cssVarV2 } from '@toeverything/theme/v2';
import { html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  analyzeFormula,
  expressionToDisplay,
  expressionToTokens,
  type FormulaToken,
  type FormulaWarning,
  parseFormula,
} from '../automation/formula/index.js';

const editorBoxStyle = `
  min-height: 44px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid ${cssVarV2.layer.insideBorder.border};
  background: ${cssVarV2.layer.background.secondary};
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  position: relative;
`;

const pillStyle = `
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  background: ${cssVarV2.button.primary};
  color: ${cssVarV2.button.pureWhite};
  font-size: 12px;
  line-height: 1.4;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const textTokenStyle = `
  font-size: 13px;
  color: ${cssVarV2.text.primary};
`;

const opStyle = `
  font-size: 13px;
  color: ${cssVarV2.status.warning};
  font-weight: 600;
  padding: 0 2px;
`;

const warningStyle = `
  margin-top: 4px;
  font-size: 11px;
  color: ${cssVarV2.status.warning};
`;

const textareaStyle = `
  width: 100%;
  box-sizing: border-box;
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid ${cssVarV2.layer.insideBorder.border};
  background: ${cssVarV2.input.background};
  color: ${cssVarV2.text.primary};
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  resize: vertical;
  min-height: 32px;
`;

const insertBtnStyle = `
  border: none;
  background: transparent;
  color: ${cssVarV2.text.secondary};
  cursor: pointer;
  font-size: 11px;
  padding: 2px 6px;
`;

export class ButtonFormulaEditor extends ShadowlessElement {
  @property({ attribute: false })
  accessor value!: ButtonValueExpression;

  @property({ attribute: false })
  accessor onChange!: (value: ButtonValueExpression) => void;

  @property({ type: Number })
  accessor stepCount = 0;

  @property({ attribute: false })
  accessor placeholder = 'Enter formula...';

  @state()
  private accessor _editing = false;

  @state()
  private accessor _draft = '';

  private get warnings(): FormulaWarning[] {
    return analyzeFormula(this.value);
  }

  private get tokens(): FormulaToken[] {
    return expressionToTokens(this.value);
  }

  private _startEdit() {
    this._draft = expressionToDisplay(this.value);
    this._editing = true;
  }

  private _commitEdit() {
    this._editing = false;
    const parsed = parseFormula(this._draft);
    this.onChange(parsed);
  }

  private _insertSnippet(snippet: string) {
    const current = this._editing
      ? this._draft
      : expressionToDisplay(this.value);
    const next = current.trim() ? `${current} + ${snippet}` : snippet;
    this._draft = next;
    this._editing = true;
    this.onChange(parseFormula(next));
  }

  private _renderToken(token: FormulaToken) {
    if (token.kind === 'text') {
      return html`<span style=${textTokenStyle}>${token.value}</span>`;
    }
    if (token.kind === 'op') {
      return html`<span style=${opStyle}>+</span>`;
    }
    if (token.kind === 'ref') {
      return html`<span style=${pillStyle} title=${token.label}
        >↗ ${token.label}</span
      >`;
    }
    return html`<span style=${pillStyle}>${token.name}(...)</span>`;
  }

  override render() {
    const hasTokens = this.tokens.length > 0;

    return html`
      <div>
        <div style=${editorBoxStyle} @click=${() => this._startEdit()}>
          ${hasTokens
            ? repeat(
                this.tokens,
                (_, i) => i,
                token => this._renderToken(token)
              )
            : html`<span style="opacity:0.5;font-size:12px;"
                >${this.placeholder}</span
              >`}
          <span
            style="
              position: absolute;
              right: 8px;
              bottom: 6px;
              opacity: 0.45;
              font-size: 14px;
              font-family: 'Times New Roman', serif;
            "
            >Σ</span
          >
        </div>

        ${this._editing
          ? html`<textarea
              style=${textareaStyle}
              .value=${this._draft}
              placeholder=${this.placeholder}
              @input=${(e: Event) => {
                this._draft = (e.target as HTMLTextAreaElement).value;
              }}
              @blur=${() => this._commitEdit()}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  this._commitEdit();
                }
              }}
            ></textarea>`
          : nothing}

        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">
          <button
            style=${insertBtnStyle}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._insertSnippet('This page');
            }}
          >
            + This page
          </button>
          <button
            style=${insertBtnStyle}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._insertSnippet('This page.Name');
            }}
          >
            + Name
          </button>
          <button
            style=${insertBtnStyle}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._insertSnippet('🗓️ Date triggered');
            }}
          >
            + Date triggered
          </button>
          ${this.stepCount > 0
            ? html`<button
                style=${insertBtnStyle}
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this._insertSnippet(
                    `Page added in step ${Math.min(2, this.stepCount)}`
                  );
                }}
              >
                + Step page
              </button>`
            : nothing}
          <button
            style=${insertBtnStyle}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._insertSnippet(
                'dateRange(🗓️ Date triggered, This page.Deadline)'
              );
            }}
          >
            + dateRange
          </button>
          <button
            style=${insertBtnStyle}
            @click=${(e: Event) => {
              e.stopPropagation();
              this._insertSnippet(
                'if(empty(This page.Property), "...", "...")'
              );
            }}
          >
            + if empty
          </button>
        </div>

        ${repeat(
          this.warnings,
          (w, i) => `${w.message}-${i}`,
          w => html`<div style=${warningStyle}>${w.message}</div>`
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-button-formula-editor': ButtonFormulaEditor;
  }
}
