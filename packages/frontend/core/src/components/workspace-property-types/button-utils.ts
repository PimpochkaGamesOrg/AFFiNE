import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import type { ButtonAutomationConfig } from '@blocksuite/affine/model';
import { defaultButtonAutomation } from '@blocksuite/affine/model';

export type ButtonPropertyAdditionalData = {
  automation: ButtonAutomationConfig;
};

export function parseButtonPropertyData(
  propertyInfo?: DocCustomPropertyInfo
): ButtonPropertyAdditionalData {
  const data = propertyInfo?.additionalData as
    | Partial<ButtonPropertyAdditionalData>
    | undefined;
  if (data?.automation) {
    return {
      automation: JSON.parse(JSON.stringify(data.automation)),
    };
  }
  return { automation: defaultButtonAutomation() };
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
