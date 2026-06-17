import { notify, PropertyValue } from '@affine/component';
import { DocService } from '@affine/core/modules/doc';
import { EditorService } from '@affine/core/modules/editor';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import {
  effects as registerButtonEffects,
  executeButtonAutomationConfig,
  getButtonAutomationProvider,
  openButtonAutomationConfigPanel,
} from '@blocksuite/affine/blocks/button';
import type { ButtonAutomationConfig } from '@blocksuite/affine/model';
import { SettingsIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type MouseEvent, useCallback, useRef, useState } from 'react';

import { useGuard } from '../guard';
import type { PropertyValueProps } from '../properties/types';
import * as styles from './button.css';
import {
  buildButtonPropertyAdditionalData,
  createButtonPropertyAdditionalData,
  isButtonPropertyVisible,
  isSourceDatabaseUsedByAnotherButtonProperty,
  parseButtonPropertyData,
} from './button-utils';

function ensureButtonEffects() {
  registerButtonEffects();
}

export const ButtonValue = ({ propertyInfo, readonly }: PropertyValueProps) => {
  const editorService = useService(EditorService);
  const workspaceService = useService(WorkspaceService);
  const workspacePropertyService = useService(WorkspacePropertyService);
  const docService = useService(DocService);
  const editorContainer = useLiveData(editorService.editor.editorContainer$);
  const containerRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const canConfigure = useGuard('Workspace_Properties_Update');

  const propertyId = propertyInfo?.id ?? '';
  const livePropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(propertyId)
  );
  const workspaceProperties = useLiveData(workspacePropertyService.properties$);
  const automation = parseButtonPropertyData(livePropertyInfo ?? propertyInfo);
  const docId = docService.doc.id;
  const visible = isButtonPropertyVisible(
    workspaceService.workspace.docCollection,
    docId,
    automation
  );
  const disabled = running;

  const persistAutomation = useCallback(
    (config: ButtonAutomationConfig) => {
      if (!propertyInfo?.id) return;
      if (
        config.sourceDatabase &&
        isSourceDatabaseUsedByAnotherButtonProperty(
          workspaceProperties,
          propertyInfo.id,
          config.sourceDatabase
        )
      ) {
        return;
      }
      workspacePropertyService.updatePropertyInfo(propertyInfo.id, {
        additionalData: buildButtonPropertyAdditionalData(config),
      });
    },
    [propertyInfo, workspaceProperties, workspacePropertyService]
  );

  const handleConfigure = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canConfigure || !containerRef.current) return;
      ensureButtonEffects();
      openButtonAutomationConfigPanel({
        anchor: containerRef.current,
        workspace: workspaceService.workspace.docCollection,
        config: automation,
        onSave: persistAutomation,
      });
    },
    [automation, canConfigure, persistAutomation, workspaceService]
  );

  const handleRun = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (readonly) return;

      if (!automation.sourceDatabase) {
        notify.warning({
          title: 'Select a source database in button settings first',
        });
        return;
      }
      if (automation.actions.length === 0) {
        notify.warning({
          title: 'Add at least one action in button settings',
        });
        return;
      }
      if (running) return;

      const host = editorContainer?.host ?? null;
      if (!host) {
        notify.warning({ title: 'Editor is not ready, try again' });
        return;
      }

      const provider = getButtonAutomationProvider(host.std);
      if (!provider) {
        notify.error({ title: 'Automation service is unavailable' });
        return;
      }

      const label = automation.label || propertyInfo?.name || 'Button';
      notify({ title: `Running «${label}»...` });

      setRunning(true);
      executeButtonAutomationConfig(automation, host, provider)
        .then(result => {
          if (result.ok) {
            notify.success({ title: `«${label}» completed` });
            return;
          }
          if (result.reason === 'cancelled') {
            notify({ title: 'Automation cancelled' });
            return;
          }
          notify.warning({
            title: result.message ?? 'Automation failed',
          });
        })
        .catch(() => {
          notify.error({ title: 'Automation failed unexpectedly' });
        })
        .finally(() => {
          setRunning(false);
        });
    },
    [automation, editorContainer, propertyInfo?.name, readonly, running]
  );

  if (!visible) {
    return null;
  }

  return (
    <PropertyValue readonly={readonly}>
      <div ref={containerRef} className={styles.container}>
        <button
          type="button"
          className={styles.actionButton}
          disabled={disabled || readonly}
          onClick={handleRun}
        >
          {running
            ? 'Running...'
            : automation.label || propertyInfo?.name || 'Button'}
        </button>
        {canConfigure ? (
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
