import { css } from '@emotion/css';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import type { TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import {
  TABLE_VIEWPORT_MAX_HEIGHT,
  TABLE_VIEWPORT_MIN_HEIGHT,
} from './consts.js';
import type { TableSingleView } from './table-view-manager.js';

export const tableViewportWrapperStyle = css({
  position: 'relative',
  width: '100%',
});

export const tableStickyColumnHeaderStyle = css({
  position: 'sticky',
  top: 0,
  zIndex: 3,
  width: 'fit-content',
  minWidth: '100%',
  backgroundColor: 'var(--affine-background-primary-color)',
});

export const tableViewportResizeHandleStyle = css({
  position: 'absolute',
  right: '0',
  bottom: '0',
  width: '20px',
  height: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'ns-resize',
  zIndex: 2,
  color: cssVarV2.icon.secondary,
  opacity: 0.45,
  transition: 'opacity 0.15s ease',
  [`${tableViewportWrapperStyle}:hover &`]: {
    opacity: 1,
  },
  '&:hover': {
    color: cssVarV2.icon.primary,
  },
  '&::before': {
    content: '""',
    width: '12px',
    height: '2px',
    borderRadius: '1px',
    backgroundColor: 'currentColor',
    boxShadow: '0 4px 0 currentColor, 0 8px 0 currentColor',
  },
});

const clampViewportHeight = (height: number) =>
  Math.min(TABLE_VIEWPORT_MAX_HEIGHT, Math.max(TABLE_VIEWPORT_MIN_HEIGHT, height));

export const startTableViewportResize = (
  event: PointerEvent,
  options: {
    startHeight: number;
    onResize: (height: number) => void;
    onResizeEnd: (height: number) => void;
  }
) => {
  event.preventDefault();
  event.stopPropagation();
  const startY = event.clientY;
  const startHeight = options.startHeight;

  const getNextHeight = (clientY: number) =>
    clampViewportHeight(startHeight + (clientY - startY));

  const onPointerMove = (e: PointerEvent) => {
    options.onResize(getNextHeight(e.clientY));
  };

  const onPointerUp = (e: PointerEvent) => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    document.body.style.removeProperty('cursor');
    options.onResizeEnd(getNextHeight(e.clientY));
  };

  document.body.style.cursor = 'ns-resize';
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
};

export class TableViewportResizeController {
  readonly tempHeight$ = signal<number | undefined>();

  readonly effectiveHeight$: ReadonlySignal<number>;

  constructor(private readonly view: TableSingleView) {
    this.effectiveHeight$ = computed(
      () => this.tempHeight$.value ?? this.view.viewportHeight$.value
    );
  }

  onResizeStart = (event: PointerEvent) => {
    if (this.view.readonly$.value) {
      return;
    }
    startTableViewportResize(event, {
      startHeight: this.effectiveHeight$.value,
      onResize: height => {
        this.tempHeight$.value = height;
      },
      onResizeEnd: height => {
        this.tempHeight$.value = undefined;
        this.view.setViewportHeight(height);
      },
    });
  };
}

export const renderTableViewportResizeHandle = (
  controller: TableViewportResizeController,
  readonly: boolean
): TemplateResult | '' => {
  if (readonly) {
    return '';
  }
  return html`
    <div
      class="${tableViewportResizeHandleStyle}"
      @pointerdown="${controller.onResizeStart}"
    ></div>
  `;
};

export const getTableViewportStyle = (height: number) =>
  styleMap({
    height: `${height}px`,
    maxHeight: `${height}px`,
  });
