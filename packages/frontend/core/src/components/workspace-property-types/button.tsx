import { PropertyValue } from '@affine/component';
import { EditorService } from '@affine/core/modules/editor';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import {
  effects as buttonEffects,
  executeButtonAutomationConfig,
  getButtonAutomationProvider,
  openButtonAutomationConfigPanel,
} from '@blocksuite/affine/blocks/button';
import type { ButtonAutomationConfig } from '@blocksuite/affine/model';
import { SettingsIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type MouseEvent, useCallback, useRef, useState } from 'react';

import type { PropertyValueProps } from '../properties/types';
import * as styles from './button.css';
import {
  type ButtonPropertyAdditionalData,
  createButtonPropertyAdditionalData,
  parseButtonPropertyData,
} from './button-utils';

let buttonEffectsRegistered = false;

function ensureButtonEffects() {
  if (buttonEffectsRegistered) return;
  buttonEffects();
  buttonEffectsRegistered = true;
}

function saveButtonPropertyData(
  propertyId: string,
  data: ButtonPropertyAdditionalData,
  workspacePropertyService: WorkspacePropertyService
) {
  workspacePropertyService.updatePropertyInfo(propertyId, {
    additionalData: data,
  });
}

export const ButtonValue = ({ propertyInfo, readonly }: PropertyValueProps) => {
  const editorService = useService(EditorService);
  const workspaceService = useService(WorkspaceService);
  const workspacePropertyService = useService(WorkspacePropertyService);
  const editorContainer = useLiveData(editorService.editor.editorContainer$);
  const containerRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);

  const propertyId = propertyInfo?.id ?? '';
  const livePropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(propertyId)
  );
  const { automation } = parseButtonPropertyData(
    livePropertyInfo ?? propertyInfo
  );
  const disabled = running || automation.actions.length === 0;

  const persistAutomation = useCallback(
    (config: ButtonAutomationConfig) => {
      if (!propertyInfo?.id) return;
      saveButtonPropertyData(
        propertyInfo.id,
        { automation: config },
        workspacePropertyService
      );
    },
    [propertyInfo, workspacePropertyService]
  );

  const handleConfigure = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (readonly || !propertyInfo?.id || !containerRef.current) return;
      ensureButtonEffects();
      openButtonAutomationConfigPanel({
        anchor: containerRef.current,
        workspace: workspaceService.workspace.docCollection,
        config: automation,
        onSave: persistAutomation,
      });
    },
    [automation, persistAutomation, propertyInfo, readonly, workspaceService]
  );

  const handleRun = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (readonly || disabled) return;

      const host = editorContainer?.host ?? null;
      if (!host) return;

      const provider = getButtonAutomationProvider(host.std);
      if (!provider) return;

      setRunning(true);
      executeButtonAutomationConfig(automation, host, provider, {
        onSourceResolved: config => {
          if (automation.source) return;
          persistAutomation(config);
        },
      })
        .then(result => {
          if (!result.ok && result.reason !== 'cancelled' && result.message) {
            provider.notify?.({
              title: result.message,
              accent: 'warning',
            });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          setRunning(false);
        });
    },
    [automation, disabled, editorContainer, persistAutomation, readonly]
  );

  return (
    <PropertyValue readonly={readonly}>
      <div ref={containerRef} className={styles.container}>
        <button
          type="button"
          className={styles.actionButton}
          disabled={disabled || readonly}
          onClick={handleRun}
        >
          {automation.label || propertyInfo?.name || 'Button'}
        </button>
        {!readonly ? (
          <button
            type="button"
            className={styles.configureButton}
            aria-label="Configure button"
            onClick={handleConfigure}
          >
            <SettingsIcon width={16} height={16} />
          </button>
        ) : null}
      </div>
    </PropertyValue>
  );
};

export const ButtonFilterValue = () => null;

export const ButtonDocListProperty = () => null;

export const ButtonGroupHeader = () => null;

export function getButtonPropertyCreatePayload(name?: string) {
  return {
    additionalData: createButtonPropertyAdditionalData(name),
  };
}
