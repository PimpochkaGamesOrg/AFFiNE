import { ButtonBlockComponent } from './button-block.js';
import { ButtonConfigPanel } from './components/button-config-panel.js';
import { ButtonConfirmDialog } from './components/confirm-dialog.js';
import { ButtonDatabaseSelect } from './components/database-select.js';
import { ButtonFormulaEditor } from './components/formula-editor.js';

function defineButtonElement(
  name: string,
  constructor: CustomElementConstructor
) {
  if (!customElements.get(name)) {
    customElements.define(name, constructor);
  }
}

export function effects() {
  defineButtonElement('affine-button', ButtonBlockComponent);
  defineButtonElement('affine-button-config-panel', ButtonConfigPanel);
  defineButtonElement('affine-button-confirm-dialog', ButtonConfirmDialog);
  defineButtonElement('affine-button-formula-editor', ButtonFormulaEditor);
  defineButtonElement('affine-button-database-select', ButtonDatabaseSelect);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-button': ButtonBlockComponent;
    'affine-button-config-panel': ButtonConfigPanel;
    'affine-button-confirm-dialog': ButtonConfirmDialog;
    'affine-button-formula-editor': ButtonFormulaEditor;
    'affine-button-database-select': ButtonDatabaseSelect;
  }
}
