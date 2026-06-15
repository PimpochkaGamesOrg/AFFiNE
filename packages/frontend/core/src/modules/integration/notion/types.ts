export type NotionRichText = {
  type: string;
  plain_text: string;
  href?: string | null;
  text?: { content: string; link?: { url: string } | null };
};

export type NotionBlock = {
  id: string;
  type: string;
  has_children: boolean;
  children?: NotionBlock[];
  [key: string]: unknown;
};

export type NotionPage = {
  id: string;
  url: string;
  last_edited_time: string;
  properties: Record<string, NotionPageProperty>;
};

export type NotionPageProperty = {
  id: string;
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  number?: number | null;
  select?: { id: string; name: string; color: string } | null;
  multi_select?: { id: string; name: string; color: string }[];
  date?: { start: string; end?: string | null } | null;
  checkbox?: boolean;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
  status?: { id: string; name: string; color: string } | null;
  relation?: { id: string }[];
  people?: { id: string; name?: string; person?: { email?: string } }[];
  files?: { name: string; external?: { url: string } }[];
  formula?: { type: string; string?: string; number?: number; boolean?: boolean };
  rollup?: { type: string; array?: unknown[]; number?: number; date?: { start: string } };
  unique_id?: { prefix?: string | null; number?: number | null };
  created_time?: string;
  last_edited_time?: string;
};

export type NotionDatabasePropertySchema = {
  id: string;
  type: string;
  name?: string;
  select?: { options: { id: string; name: string; color: string }[] };
  multi_select?: { options: { id: string; name: string; color: string }[] };
  status?: { options: { id: string; name: string; color: string }[] };
};

export type NotionDatabase = {
  id: string;
  properties: Record<string, NotionDatabasePropertySchema>;
};

export type NotionQueryResponse = {
  object: string;
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
};

export type NotionBlocksResponse = {
  object: string;
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
};
