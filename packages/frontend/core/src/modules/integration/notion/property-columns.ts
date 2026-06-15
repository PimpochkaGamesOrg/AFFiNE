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
  relation: 'rich-text',
  people: 'rich-text',
  files: 'rich-text',
  formula: 'rich-text',
  rollup: 'rich-text',
  unique_id: 'rich-text',
  created_time: 'date',
  last_edited_time: 'date',
  created_by: 'rich-text',
  last_edited_by: 'rich-text',
};

export function getAffinePropertyType(notionType: string): string {
  return NOTION_TO_AFFINE_TYPE[notionType] ?? 'rich-text';
}

export function isSelectLikeProperty(type: string) {
  return type === 'select' || type === 'multi_select' || type === 'status';
}

export function buildSelectOptionsFromSchema(
  schema: NotionDatabasePropertySchema
): SelectOption[] {
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

function applySelectOptions(
  datasource: DatabaseBlockDataSource,
  columnId: string,
  schema: NotionDatabasePropertySchema,
  property?: NotionPageProperty
) {
  if (!isSelectLikeProperty(schema.type)) return;

  const data = datasource.propertyDataGet(columnId) as {
    options?: SelectOption[];
  };
  const options = mergeSelectOptions(
    mergeSelectOptions(data.options ?? [], buildSelectOptionsFromSchema(schema)),
    property ? collectSelectOptionsFromValue(property) : []
  );
  if (options.length > 0) {
    datasource.propertyDataSet(columnId, { options });
  }
}

export function ensureColumnFromSchema(
  datasource: DatabaseBlockDataSource,
  propertyName: string,
  schema: NotionDatabasePropertySchema
): string | undefined {
  if (schema.type === 'title') return undefined;

  const displayName = schema.name?.trim() || propertyName;
  const affineType = getAffinePropertyType(schema.type);

  let columnId = findColumnIdByName(datasource, displayName);
  if (!columnId) {
    columnId = datasource.propertyAdd('end', {
      type: affineType,
      name: displayName,
    });
    if (!columnId) return undefined;
  }

  applySelectOptions(datasource, columnId, schema);
  return columnId;
}

export function ensureAllColumnsFromSchema(
  datasource: DatabaseBlockDataSource,
  schema: Record<string, NotionDatabasePropertySchema>
) {
  for (const [propertyName, propertySchema] of Object.entries(schema)) {
    ensureColumnFromSchema(datasource, propertyName, propertySchema);
  }
}

export function ensureColumn(
  datasource: DatabaseBlockDataSource,
  propertyName: string,
  property: NotionPageProperty,
  schema?: NotionDatabasePropertySchema
): string | undefined {
  if (property.type === 'title') return undefined;

  if (schema) {
    return ensureColumnFromSchema(datasource, propertyName, schema);
  }

  const affineType = getAffinePropertyType(property.type);
  const displayName = propertyName;

  let columnId = findColumnIdByName(datasource, displayName);
  if (!columnId) {
    columnId = datasource.propertyAdd('end', {
      type: affineType,
      name: displayName,
    });
    if (!columnId) return undefined;
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

export function findColumnIdForProperty(
  datasource: DatabaseBlockDataSource,
  propertyName: string,
  schema?: NotionDatabasePropertySchema
) {
  const displayName = schema?.name?.trim() || propertyName;
  return findColumnIdByName(datasource, displayName);
}
