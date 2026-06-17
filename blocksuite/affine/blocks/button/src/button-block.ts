import { CaptionedBlockComponent } from '@blocksuite/affine-components/caption';
import type { ButtonBlockModel } from '@blocksuite/affine-model';
import { SettingsIcon } from '@blocksuite/icons/lit';
import { html, nothing } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { executeButtonAutomation } from './automation/executor.js';
import {
  buttonBlockStyles,
  buttonConfigureButtonStyles,
  buttonContainerStyles,
  buttonLabelStyles,
} from './button-block-styles.js';
import { openButtonConfigPanel } from './components/button-config-panel.js';
import { getButtonAutomationProvider } from './services/button-automation-provider.js';

export class ButtonBlockComponent extends CaptionedBlockComponent<ButtonBlockModel> {
  private _running = false;

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(buttonBlockStyles);
  }

  private async _onClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (this._running || this.store.readonly) return;

    const provider = getButtonAutomationProvider(this.std);
    if (!provider) return;

    this._running = true;
    try {
      const result = await executeButtonAutomation(
        this.model,
        this.host,
        provider
      );
      if (!result.ok && result.reason !== 'cancelled' && result.message) {
        provider.notify?.({
          title: result.message,
          accent: 'warning',
        });
      }
    } finally {
      this._running = false;
    }
  }

  private _onConfigure(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (this.store.readonly) return;
    openButtonConfigPanel(this.model, this, config => {
      this.store.transact(() => {
        this.model.props.automation = config;
      });
    });
  }

  override renderBlock() {
    const { label, actions } = this.model.props.automation;
    const disabled = this._running || actions.length === 0;

    return html`
      <div
        contenteditable="false"
        class="${buttonContainerStyles}"
        style=${styleMap({
          opacity: disabled ? '0.6' : '1',
          pointerEvents: disabled ? 'none' : 'auto',
        })}
      >
        <button class="${buttonLabelStyles}" @click=${this._onClick}>
          ${label}
        </button>
        ${this.store.readonly
          ? nothing
          : html`
              <button
                class="${buttonConfigureButtonStyles}"
                aria-label="Configure button"
                @click=${this._onConfigure}
              >
                ${SettingsIcon({ width: '16px', height: '16px' })}
              </button>
            `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-button': ButtonBlockComponent;
  }
}
