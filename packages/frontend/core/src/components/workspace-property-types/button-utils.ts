import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import { findSourceRowForDocInDatabase } from '@blocksuite/affine/blocks/button';
import type { ButtonAutomationConfig } from '@blocksuite/affine/model';
import { defaultButtonAutomation } from '@blocksuite/affine/model';
import type { Workspace } from '@blocksuite/store';

export type ButtonPropertyAdditionalData = {
  automation: ButtonAutomationConfig;
};

export function parseButtonPropertyData(
  propertyInfo?: DocCustomPropertyInfo | null
): ButtonAutomationConfig {
  const data = propertyInfo?.additionalData as
    | Partial<ButtonPropertyAdditionalData>
    | undefined;
  if (data?.automation) {
    const parsed = JSON.parse(
      JSON.stringify(data.automation)
    ) as ButtonAutomationConfig;
    const { source: _source, ...sharedAutomation } = parsed;
    return sharedAutomation;
  }
  const automation = defaultButtonAutomation();
  if (propertyInfo?.name) {
    automation.label = propertyInfo.name;
  }
  return automation;
}

export function buildButtonPropertyAdditionalData(
  automation: ButtonAutomationConfig
): ButtonPropertyAdditionalData {
  const { source: _source, ...sharedAutomation } = automation;
  return { automation: sharedAutomation };
}

export function createButtonPropertyAdditionalData(
  name?: string
): ButtonPropertyAdditionalData {
  const automation = defaultButtonAutomation();
  if (name) {
    automation.label = name;
  }
  return { automation };
}

export type ButtonDatabaseBacklink = {
  docId: string;
  databaseBlockId: string;
};

function sourceDatabaseKey(
  sourceDatabase: NonNullable<ButtonAutomationConfig['sourceDatabase']>
) {
  return `${sourceDatabase.databaseDocId}:${sourceDatabase.databaseBlockId}`;
}

export function isButtonPropertyVisible(
  workspace: Workspace,
  docId: string,
  automation: ButtonAutomationConfig,
  databaseBacklinks?: ButtonDatabaseBacklink[]
): boolean {
  const { sourceDatabase } = automation;
  if (!sourceDatabase?.databaseDocId || !sourceDatabase.databaseBlockId) {
    return false;
  }
  const sourceKey = sourceDatabaseKey(sourceDatabase);
  if (databaseBacklinks?.length) {
    return databaseBacklinks.some(
      backlink => `${backlink.docId}:${backlink.databaseBlockId}` === sourceKey
    );
  }
  return !!findSourceRowForDocInDatabase(
    workspace,
    docId,
    sourceDatabase.databaseDocId,
    sourceDatabase.databaseBlockId
  );
}
