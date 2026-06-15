import type {
  NotionBlock,
  NotionBlocksResponse,
  NotionPage,
  NotionQueryResponse,
} from './types';

export class NotionApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const normalizedBase = this.baseUrl.replace(/\/$/, '');
    const response = await fetch(`${normalizedBase}/api/notion/${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Notion-Token': this.token,
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Notion API error (${response.status}): ${body}`);
    }

    return response.json() as Promise<T>;
  }

  verifyToken() {
    return this.request<{ object: string }>('users/me');
  }

  queryDatabase(databaseId: string, startCursor?: string | null) {
    return this.request<NotionQueryResponse>(`databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 25,
        start_cursor: startCursor ?? undefined,
      }),
    });
  }

  getBlockChildren(blockId: string, startCursor?: string | null) {
    const query = startCursor ? `?start_cursor=${startCursor}` : '';
    return this.request<NotionBlocksResponse>(
      `blocks/${blockId}/children${query}`
    );
  }

  async getAllBlockChildren(blockId: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | null | undefined;

    do {
      const response = await this.getBlockChildren(blockId, cursor);
      blocks.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    return blocks;
  }

  parseDatabaseId(input: string): string {
    const trimmed = input.trim();
    const uuidMatch = trimmed.match(
      /[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    if (!uuidMatch) {
      throw new Error('Invalid Notion database ID or URL');
    }
    return uuidMatch[0].replace(/-/g, '').length === 32
      ? [
          uuidMatch[0].slice(0, 8),
          uuidMatch[0].slice(8, 12),
          uuidMatch[0].slice(12, 16),
          uuidMatch[0].slice(16, 20),
          uuidMatch[0].slice(20),
        ].join('-')
      : uuidMatch[0];
  }
}

export type { NotionPage };
