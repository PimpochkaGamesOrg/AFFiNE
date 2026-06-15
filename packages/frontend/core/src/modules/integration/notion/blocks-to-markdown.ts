import type { NotionBlock, NotionRichText } from './types';

function richTextToMarkdown(richText: NotionRichText[] | undefined): string {
  if (!richText?.length) return '';
  return richText
    .map(item => {
      let text = item.plain_text ?? item.text?.content ?? '';
      const href = item.href ?? item.text?.link?.url;
      if (href) {
        text = `[${text}](${href})`;
      }
      return text;
    })
    .join('');
}

function blockPayload(block: NotionBlock): Record<string, unknown> | undefined {
  const payload = block[block.type];
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : undefined;
}

async function fetchChildren(
  block: NotionBlock,
  loadChildren: (blockId: string) => Promise<NotionBlock[]>
): Promise<NotionBlock[]> {
  if (block.children?.length) return block.children;
  if (!block.has_children) return [];
  return loadChildren(block.id);
}

async function blockToMarkdown(
  block: NotionBlock,
  loadChildren: (blockId: string) => Promise<NotionBlock[]>,
  depth = 0
): Promise<string> {
  const payload = blockPayload(block);
  const indent = '  '.repeat(depth);

  switch (block.type) {
    case 'paragraph': {
      const text = richTextToMarkdown(payload?.rich_text as NotionRichText[]);
      return text ? `${indent}${text}\n\n` : '\n';
    }
    case 'heading_1':
      return `${indent}# ${richTextToMarkdown(payload?.rich_text as NotionRichText[])}\n\n`;
    case 'heading_2':
      return `${indent}## ${richTextToMarkdown(payload?.rich_text as NotionRichText[])}\n\n`;
    case 'heading_3':
      return `${indent}### ${richTextToMarkdown(payload?.rich_text as NotionRichText[])}\n\n`;
    case 'bulleted_list_item': {
      const children = await fetchChildren(block, loadChildren);
      const childMd = await blocksToMarkdown(children, loadChildren, depth + 1);
      return `${indent}- ${richTextToMarkdown(payload?.rich_text as NotionRichText[])}\n${childMd}`;
    }
    case 'numbered_list_item': {
      const children = await fetchChildren(block, loadChildren);
      const childMd = await blocksToMarkdown(children, loadChildren, depth + 1);
      return `${indent}1. ${richTextToMarkdown(payload?.rich_text as NotionRichText[])}\n${childMd}`;
    }
    case 'to_do': {
      const checked = payload?.checked ? 'x' : ' ';
      const children = await fetchChildren(block, loadChildren);
      const childMd = await blocksToMarkdown(children, loadChildren, depth + 1);
      return `${indent}- [${checked}] ${richTextToMarkdown(payload?.rich_text as NotionRichText[])}\n${childMd}`;
    }
    case 'toggle': {
      const children = await fetchChildren(block, loadChildren);
      const childMd = await blocksToMarkdown(children, loadChildren, depth);
      return `${indent}**${richTextToMarkdown(payload?.rich_text as NotionRichText[])}**\n${childMd}\n`;
    }
    case 'quote':
      return `${indent}> ${richTextToMarkdown(payload?.rich_text as NotionRichText[])}\n\n`;
    case 'callout':
      return `${indent}> ${richTextToMarkdown(payload?.rich_text as NotionRichText[])}\n\n`;
    case 'code': {
      const language = (payload?.language as string) ?? '';
      const code = richTextToMarkdown(payload?.rich_text as NotionRichText[]);
      return `${indent}\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    }
    case 'divider':
      return `${indent}---\n\n`;
    case 'equation': {
      const expression = payload?.expression as string;
      return expression ? `${indent}$$${expression}$$\n\n` : '';
    }
    case 'bookmark': {
      const url = payload?.url as string;
      const caption = richTextToMarkdown(payload?.caption as NotionRichText[]);
      return url ? `${indent}[${caption || url}](${url})\n\n` : '';
    }
    case 'image':
    case 'file':
    case 'pdf':
    case 'video':
    case 'audio': {
      const caption = richTextToMarkdown(payload?.caption as NotionRichText[]);
      const name =
        caption ||
        ((payload?.name as string) ?? block.type);
      return `${indent}[${name}]\n\n`;
    }
    case 'table':
    case 'table_row':
    case 'column_list':
    case 'column':
    case 'synced_block':
    case 'child_page':
    case 'child_database':
      return '';
    default:
      return '';
  }
}

export async function blocksToMarkdown(
  blocks: NotionBlock[],
  loadChildren: (blockId: string) => Promise<NotionBlock[]>,
  depth = 0
): Promise<string> {
  const parts: string[] = [];
  for (const block of blocks) {
    parts.push(await blockToMarkdown(block, loadChildren, depth));
  }
  return parts.join('').trim();
}

export function getPageTitle(page: {
  properties: Record<string, { type: string; title?: NotionRichText[] }>;
}): string {
  for (const property of Object.values(page.properties)) {
    if (property.type === 'title') {
      return richTextToMarkdown(property.title) || 'Untitled';
    }
  }
  return 'Untitled';
}
