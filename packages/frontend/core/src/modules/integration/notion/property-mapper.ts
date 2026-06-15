import { Text } from '@blocksuite/affine/store';

import type { NotionPageProperty } from './types';

export function getCellValueForProperty(
  property: NotionPageProperty,
  resolveSelect: (name?: string | null) => string | undefined,
  resolveMultiSelect: (names: string[]) => string[]
): unknown {
  switch (property.type) {
    case 'rich_text':
      return new Text(
        property.rich_text?.map(item => item.plain_text).join('') ?? ''
      );
    case 'number':
      return property.number ?? undefined;
    case 'select':
      return resolveSelect(property.select?.name);
    case 'multi_select':
      return resolveMultiSelect(
        property.multi_select?.map(item => item.name) ?? []
      );
    case 'status':
      return resolveSelect(property.status?.name);
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
      return new Text(property.phone_number ?? '');
    case 'unique_id': {
      const prefix = property.unique_id?.prefix ?? '';
      const number = property.unique_id?.number ?? '';
      return new Text(`${prefix}${number}`);
    }
    case 'created_time':
    case 'last_edited_time': {
      const raw =
        property.type === 'created_time'
          ? property.created_time
          : property.last_edited_time;
      if (!raw) return undefined;
      const start = new Date(raw).getTime();
      return Number.isNaN(start) ? undefined : { start, end: null };
    }
    case 'formula': {
      if (property.formula?.string != null) {
        return new Text(property.formula.string);
      }
      if (property.formula?.number != null) {
        return property.formula.number;
      }
      if (property.formula?.boolean != null) {
        return property.formula.boolean;
      }
      return undefined;
    }
    case 'relation': {
      const count = property.relation?.length ?? 0;
      return count > 0 ? new Text(`${count}`) : undefined;
    }
    case 'people': {
      const text = property.people
        ?.map(person => person.name || person.person?.email || person.id)
        .filter(Boolean)
        .join(', ');
      return text ? new Text(text) : undefined;
    }
    case 'files': {
      const text = property.files
        ?.map(file => file.name || file.external?.url)
        .filter(Boolean)
        .join(', ');
      return text ? new Text(text) : undefined;
    }
    case 'rollup': {
      if (property.rollup?.number != null) {
        return property.rollup.number;
      }
      if (property.rollup?.date?.start) {
        const start = new Date(property.rollup.date.start).getTime();
        return Number.isNaN(start) ? undefined : { start, end: null };
      }
      if (Array.isArray(property.rollup?.array) && property.rollup.array.length) {
        return new Text(String(property.rollup.array.length));
      }
      return undefined;
    }
    case 'created_by':
    case 'last_edited_by':
      return undefined;
    default:
      return undefined;
  }
}
