import { cssVarV2 } from '@toeverything/theme/v2';
import { css } from '@emotion/css';

export const buttonBlockStyles = css({
  margin: '8px 0',
});

export const buttonContainerStyles = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
});

export const buttonLabelStyles = css({
  border: 'none',
  borderRadius: '8px',
  padding: '8px 14px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  background: cssVarV2.button.primary,
  color: cssVarV2.button.pureWhite,
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
  ':hover': {
    filter: 'brightness(1.03)',
  },
});

export const buttonConfigureButtonStyles = css({
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  borderRadius: '8px',
  width: '32px',
  height: '32px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  background: cssVarV2.layer.background.primary,
  color: cssVarV2.icon.primary,
});
