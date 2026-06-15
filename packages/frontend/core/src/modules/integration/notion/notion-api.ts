import type {
  NotionBlock,
  NotionBlocksResponse,
  NotionDatabase,
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

  getDatabase(databaseId: string) {
    return this.request<NotionDatabase>(`databases/${databaseId}`);
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
    const hex = input.replace(/[^0-9a-f]/gi, '');
    if (hex.length !== 32) {
      throw new Error('Invalid Notion database ID or URL');
    }
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ]
      .join('-')
      .toLowerCase();
  }
}

export type { NotionPage };
