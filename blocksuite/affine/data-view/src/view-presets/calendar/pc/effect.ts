import { CalendarCardProperty } from './card-property.js';
import { CalendarViewUI } from './view.js';

export function pcEffects() {
  if (!customElements.get('affine-data-view-calendar-card-property')) {
    customElements.define(
      'affine-data-view-calendar-card-property',
      CalendarCardProperty
    );
  }
  if (customElements.get('affine-data-view-calendar')) {
    return;
  }
  customElements.define('affine-data-view-calendar', CalendarViewUI);
}
