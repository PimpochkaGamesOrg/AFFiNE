import { ShadowlessElement } from '@blocksuite/std';
import { cssVarV2 } from '@toeverything/theme/v2';
import { html, nothing } from 'lit';
import { state } from 'lit/decorators.js';

export type ConfirmDialogResult = {
  confirmed: boolean;
};

export class ButtonConfirmDialog extends ShadowlessElement {
  @state()
  private accessor _open = false;

  @state()
  private accessor _message = '';

  @state()
  private accessor _continueText = 'Continue';

  @state()
  private accessor _cancelText = 'Cancel';

  private _resolver: ((result: ConfirmDialogResult) => void) | null = null;

  open(input: {
    message: string;
    continueText: string;
    cancelText: string;
  }): Promise<ConfirmDialogResult> {
    this._message = input.message;
    this._continueText = input.continueText;
    this._cancelText = input.cancelText;
    this._open = true;
    return new Promise(resolve => {
      this._resolver = resolve;
    });
  }

  private _close(confirmed: boolean) {
    this._open = false;
    this._resolver?.({ confirmed });
    this._resolver = null;
  }

  override render() {
    if (!this._open) return nothing;
    return html`
      <div
        style="
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.45);
        "
        @click=${() => this._close(false)}
      >
        <div
          style="
            min-width: 320px;
            max-width: 480px;
            padding: 20px;
            border-radius: 12px;
            background: ${cssVarV2.layer.background.primary};
            color: ${cssVarV2.text.primary};
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
          "
          @click=${(e: Event) => e.stopPropagation()}
        >
          <div style="font-size: 15px; line-height: 1.5; margin-bottom: 20px;">
            ${this._message}
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button
              style="
                border: 1px solid ${cssVarV2.layer.insideBorder.border};
                background: transparent;
                color: ${cssVarV2.text.primary};
                border-radius: 8px;
                padding: 8px 14px;
                cursor: pointer;
              "
              @click=${() => this._close(false)}
            >
              ${this._cancelText}
            </button>
            <button
              style="
                border: none;
                background: ${cssVarV2.button.primary};
                color: ${cssVarV2.button.pureWhite()};
                border-radius: 8px;
                padding: 8px 14px;
                cursor: pointer;
              "
              @click=${() => this._close(true)}
            >
              ${this._continueText}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-button-confirm-dialog': ButtonConfirmDialog;
  }
}

export function ensureButtonConfirmDialog(): ButtonConfirmDialog {
  let dialog = document.querySelector(
    'affine-button-confirm-dialog'
  ) as ButtonConfirmDialog | null;
  if (!dialog) {
    if (!customElements.get('affine-button-confirm-dialog')) {
      customElements.define(
        'affine-button-confirm-dialog',
        ButtonConfirmDialog
      );
    }
    dialog = document.createElement('affine-button-confirm-dialog');
    document.body.append(dialog);
  }
  return dialog;
}
