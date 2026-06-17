import { ButtonBlockComponent } from './button-block.js';
import { ButtonConfigPanel } from './components/button-config-panel.js';
import { ButtonConfirmDialog } from './components/confirm-dialog.js';
import { ButtonFormulaEditor } from './components/formula-editor.js';

export function effects() {
  customElements.define('affine-button', ButtonBlockComponent);
  customElements.define('affine-button-config-panel', ButtonConfigPanel);
  customElements.define('affine-button-confirm-dialog', ButtonConfirmDialog);
  customElements.define('affine-button-formula-editor', ButtonFormulaEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-button': ButtonBlockComponent;
    'affine-button-config-panel': ButtonConfigPanel;
    'affine-button-confirm-dialog': ButtonConfirmDialog;
    'affine-button-formula-editor': ButtonFormulaEditor;
  }
}
