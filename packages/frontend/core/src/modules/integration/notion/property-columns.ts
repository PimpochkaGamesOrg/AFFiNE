import type { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { getTagColor } from '@blocksuite/data-view';
import { nanoid } from '@blocksuite/affine/store';

import type { NotionDatabasePropertySchema, NotionPageProperty } from './types';

type SelectOption = { id: string; value: string; color: string };

const NOTION_TO_AFFINE_TYPE: Record<string, string> = {
  rich_text: 'rich-text',
  number: 'number',
  select: 'select',
  multi_select: 'multi-select',
  date: 'date',
  checkbox: 'checkbox',
  url: 'link',
  email: 'link',
  phone_number: 'rich-text',
  status: 'select',
};

export function getAffinePropertyType(notionType: string): string | undefined {
  return NOTION_TO_AFFINE_TYPE[notionType];
}

export function isSelectLikeProperty(type: string) {
  return type === 'select' || type === 'multi_select' || type === 'status';
}

export function buildSelectOptionsFromSchema(
  schema?: NotionDatabasePropertySchema
): SelectOption[] {
  if (!schema) return [];
  const notionOptions =
    schema.select?.options ??
    schema.multi_select?.options ??
    schema.status?.options ??
    [];
  return notionOptions.map(option => ({
    id: nanoid(),
    value: option.name,
    color: 'var(--affine-tag-blue)',
  }));
}

export function collectSelectOptionsFromValue(
  property: NotionPageProperty
): SelectOption[] {
  const options: SelectOption[] = [];
  const add = (name?: string) => {
    if (!name || options.some(option => option.value === name)) return;
    options.push({ id: nanoid(), value: name, color: getTagColor() });
  };

  if (property.select) add(property.select.name);
  property.multi_select?.forEach(item => add(item.name));
  if (property.status) add(property.status.name);

  return options;
}

export function mergeSelectOptions(
  existing: SelectOption[],
  incoming: SelectOption[]
): SelectOption[] {
  const merged = [...existing];
  for (const option of incoming) {
    if (!merged.some(item => item.value === option.value)) {
      merged.push(option);
    }
  }
  return merged;
}

export function findColumnIdByName(
  datasource: DatabaseBlockDataSource,
  propertyName: string
) {
  const normalized = propertyName.trim().toLowerCase();
  return datasource.properties$.value.find(columnId => {
    const name = datasource.propertyNameGet(columnId);
    return name?.trim().toLowerCase() === normalized;
  });
}

export function ensureColumn(
  datasource: DatabaseBlockDataSource,
  propertyName: string,
  property: NotionPageProperty,
  schema?: NotionDatabasePropertySchema
): string | undefined {
  const affineType = getAffinePropertyType(property.type);
  if (!affineType) return undefined;

  let columnId = findColumnIdByName(datasource, propertyName);
  if (!columnId) {
    columnId = datasource.propertyAdd('end', {
      type: affineType,
      name: propertyName,
    });
    if (!columnId) return undefined;

    if (isSelectLikeProperty(property.type)) {
      const options = mergeSelectOptions(
        buildSelectOptionsFromSchema(schema),
        collectSelectOptionsFromValue(property)
      );
      if (options.length) {
        datasource.propertyDataSet(columnId, { options });
      }
    }
    return columnId;
  }

  if (isSelectLikeProperty(property.type)) {
    const data = datasource.propertyDataGet(columnId) as {
      options?: SelectOption[];
    };
    const options = mergeSelectOptions(
      data.options ?? [],
      collectSelectOptionsFromValue(property)
    );
    if (options.length !== (data.options ?? []).length) {
      datasource.propertyDataSet(columnId, { options });
    }
  }

  return columnId;
}

export function resolveSelectOptionId(
  datasource: DatabaseBlockDataSource,
  columnId: string,
  optionName?: string | null
): string | undefined {
  if (!optionName) return undefined;
  const data = datasource.propertyDataGet(columnId) as {
    options?: SelectOption[];
  };
  const options = data.options ?? [];
  const existing = options.find(option => option.value === optionName);
  if (existing) return existing.id;

  const newOption: SelectOption = {
    id: nanoid(),
    value: optionName,
    color: getTagColor(),
  };
  datasource.propertyDataSet(columnId, {
    options: [...options, newOption],
  });
  return newOption.id;
}

export function resolveMultiSelectOptionIds(
  datasource: DatabaseBlockDataSource,
  columnId: string,
  optionNames: string[]
): string[] {
  return optionNames
    .map(name => resolveSelectOptionId(datasource, columnId, name))
    .filter((id): id is string => !!id);
}
