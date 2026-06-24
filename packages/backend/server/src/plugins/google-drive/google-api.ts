export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

export type EpisodeFolderNode = {
  name: string;
  key: string;
  children?: EpisodeFolderNode[];
};

export const EPISODE_STRUCTURE: EpisodeFolderNode[] = [
  { name: '1. ФУТАЖИ И АРТ', key: 'footage' },
  {
    name: '2. ЗВУКИ',
    key: 'voiceover',
    children: [
      { name: '1. СЫРАЯ ОЗВУЧКА', key: 'rawVoiceover' },
      { name: '2. ГОТОВАЯ ОЗВУЧКА', key: 'finishedVoiceover' },
      { name: '3. МУЗЫКА/SFX/МЕЖДОМЕТИЯ', key: 'musicSfxInterjections' },
    ],
  },
  { name: '3. АНИМАТИКИ', key: 'animatics' },
  {
    name: '4. МОНТАЖ',
    key: 'editing',
    children: [
      { name: '1. РЕВЬЮ', key: 'review' },
      { name: '2. ГОТОВЫЙ РОЛИК', key: 'finishedVideo' },
    ],
  },
  { name: '5. ЛОКАЛИЗАЦИЯ', key: 'localization' },
];

export type CreateEpisodeFoldersResult = {
  episodeFolderId: string;
  episodeFolderUrl: string;
  categoryFolderId: string;
  categoryFolderUrl: string;
  folders: Record<string, string>;
  urls: Record<string, string>;
};

type DriveFile = {
  id: string;
  name?: string;
};

type DriveListResponse = {
  files?: DriveFile[];
};

function escapeDriveQueryValue(name: string) {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function toDriveFolderUrl(fileId: string) {
  return `https://drive.google.com/drive/folders/${fileId}`;
}

export class GoogleDriveApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly requestTimeoutMs: number
  ) {}

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...init?.headers,
        },
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Google Drive API error (${response.status}): ${body.slice(0, 300)}`
        );
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async findOrCreateFolder(parentId: string, folderName: string) {
    const escaped = escapeDriveQueryValue(folderName);
    const query = `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
    listUrl.searchParams.set('q', query);
    listUrl.searchParams.set('fields', 'files(id,name)');
    listUrl.searchParams.set('spaces', 'drive');
    listUrl.searchParams.set('supportsAllDrives', 'true');
    listUrl.searchParams.set('includeItemsFromAllDrives', 'true');

    const listed = await this.fetchJson<DriveListResponse>(listUrl.toString());
    const existing = listed.files?.[0];
    if (existing?.id) {
      return existing.id;
    }

    const created = await this.fetchJson<DriveFile>(
      'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        }),
      }
    );
    if (!created.id) {
      throw new Error('Google Drive API did not return folder id');
    }
    return created.id;
  }

  private async createStructure(
    parentId: string,
    nodes: EpisodeFolderNode[],
    folders: Record<string, string>,
    urls: Record<string, string>
  ) {
    for (const node of nodes) {
      const folderId = await this.findOrCreateFolder(parentId, node.name);
      folders[node.key] = folderId;
      urls[node.key] = toDriveFolderUrl(folderId);
      if (node.children?.length) {
        await this.createStructure(folderId, node.children, folders, urls);
      }
    }
  }

  async createEpisodeFolders(input: {
    rootFolderId: string;
    categoryName: string;
    episodeTitle: string;
  }): Promise<CreateEpisodeFoldersResult> {
    const categoryFolderId = await this.findOrCreateFolder(
      input.rootFolderId,
      input.categoryName
    );
    const episodeFolderId = await this.findOrCreateFolder(
      categoryFolderId,
      input.episodeTitle
    );

    const folders: Record<string, string> = {};
    const urls: Record<string, string> = {};
    await this.createStructure(
      episodeFolderId,
      EPISODE_STRUCTURE,
      folders,
      urls
    );

    return {
      episodeFolderId,
      episodeFolderUrl: toDriveFolderUrl(episodeFolderId),
      categoryFolderId,
      categoryFolderUrl: toDriveFolderUrl(categoryFolderId),
      folders,
      urls,
    };
  }
}
