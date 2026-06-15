import { Text } from '@blocksuite/affine/store';

import type { NotionPageProperty } from './types';

export function mapNotionPropertyToCellValue(
  property: NotionPageProperty
): unknown {
  switch (property.type) {
    case 'rich_text':
      return new Text(
        property.rich_text?.map(item => item.plain_text).join('') ?? ''
      );
    case 'number':
      return property.number ?? undefined;
    case 'select':
      return property.select?.id;
    case 'multi_select':
      return property.multi_select?.map(item => item.id) ?? [];
    case 'date': {
      if (!property.date?.start) return undefined;
      const start = new Date(property.date.start).getTime();
      return Number.isNaN(start) ? undefined : { start, end: null };
    }
    case 'checkbox':
      return property.checkbox ?? false;
    case 'url':
      return property.url ?? undefined;
    case 'email':
      return property.email ?? undefined;
    case 'phone_number':
      return property.phone_number ?? undefined;
    case 'status':
      return property.status?.id;
    default:
      return undefined;
  }
}

export function ensureSelectOptions(
  property: NotionPageProperty,
  existingOptions: { id: string; value: string; color: string }[] = []
): { id: string; value: string; color: string }[] {
  const options = [...existingOptions];
  const addOption = (id: string, value: string) => {
    if (!options.some(option => option.id === id)) {
      options.push({ id, value, color: 'var(--affine-tag-blue)' });
    }
  };

  if (property.select) {
    addOption(property.select.id, property.select.name);
  }
  property.multi_select?.forEach(item => addOption(item.id, item.name));
  if (property.status) {
    addOption(property.status.id, property.status.name);
  }

  return options;
}
