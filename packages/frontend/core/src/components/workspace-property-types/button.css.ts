import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
});

export const actionButton = style({
  flex: 1,
  minWidth: 0,
  border: 'none',
  borderRadius: 8,
  padding: '8px 12px',
  background: cssVarV2('button/primary'),
  color: cssVarV2('button/pureWhite'),
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  ':disabled': {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
});

export const configureButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 8,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('icon/primary'),
  cursor: 'pointer',
  flexShrink: 0,
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});
