import { getPlainTextFromText } from '@blocksuite/affine-block-database';
import type { AffineTextStyleAttributes } from '@blocksuite/affine-shared/types';
import type { EditorHost } from '@blocksuite/std';
import type { BlockModel, Store, Text } from '@blocksuite/store';
import { cssVarV2 } from '@toeverything/theme/v2';

export type HighlightColorName =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'grey';

export type TextBlockEntry = {
  index: number;
  blockId: string;
  text: Text;
  fullText: string;
};

export type BlockToColor = {
  blockIndex: number;
  characterName: string;
  start: number;
  end: number;
};

type ScriptLine = {
  flatIndex: number;
  blockIndex: number;
  content: string;
  start: number;
  end: number;
  text: Text;
};

const FIXED_CHARACTER_COLORS: Record<string, HighlightColorName> = {
  СИМБА: 'orange',
  АРТИ: 'green',
  МУРСДЕЙ: 'purple',
  БЕНЧИК: 'blue',
  ТИГРА: 'red',
  БУЛЛИ: 'orange',
  БАНТИК: 'purple',
};

const MAIN_CHARACTERS = new Set([
  'СИМБА',
  'ТИГРА',
  'МУРСДЕЙ',
  'БУЛЛИ',
  'БЕНЧИК',
]);

const AVAILABLE_COLORS: HighlightColorName[] = [
  'green',
  'orange',
  'purple',
  'grey',
  'blue',
  'yellow',
  'red',
  'teal',
];

const COLOR_NAME_MAP: Record<string, HighlightColorName> = {
  default: 'grey',
  gray: 'grey',
  grey: 'grey',
  brown: 'orange',
  pink: 'purple',
  red: 'red',
  orange: 'orange',
  yellow: 'yellow',
  green: 'green',
  teal: 'teal',
  blue: 'blue',
  purple: 'purple',
  красный: 'red',
  оранжевый: 'orange',
  желтый: 'yellow',
  жёлтый: 'yellow',
  зеленый: 'green',
  зелёный: 'green',
  синий: 'blue',
  голубой: 'teal',
  фиолетовый: 'purple',
  розовый: 'purple',
  коричневый: 'orange',
  серый: 'grey',
};

const ORDINAL_NOUN_PATTERN =
  /^(ПЕРВЫЙ|ПЕРВАЯ|ВТОРОЙ|ВТОРАЯ|ТРЕТИЙ|ТРЕТЬЯ|ЧЕТВЕРТЫЙ|ЧЕТВЕРТАЯ|ПЯТЫЙ|ПЯТАЯ)\s+[А-ЯЁA-Z]+$/;

const TEXT_BLOCK_FLAVOURS = new Set(['affine:paragraph', 'affine:list']);

export function toHighlightCssVar(color: HighlightColorName): string {
  return cssVarV2(`text/highlight/fg/${color}`);
}

export function translateColorName(raw: string): HighlightColorName | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized || normalized === 'default') return null;
  return COLOR_NAME_MAP[normalized] ?? null;
}

export function isActionBlock(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.startsWith('кадр') ||
    lower.startsWith('отрывок из') ||
    lower.startsWith('смена ракурса') ||
    lower.startsWith('по графу') ||
    lower.startsWith('тут же') ||
    trimmed.includes('![') ||
    (lower.startsWith('сцена ') && /\d/.test(trimmed.slice(6))) ||
    trimmed.startsWith('───') ||
    trimmed.startsWith('---')
  );
}

export function isEmotionLine(text: string): boolean {
  return /^\([^)]+\)$/.test(text.trim());
}

export function isCharacterNameLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const name = extractPotentialCharacterName(trimmed);
  return name !== null && name === normalizeCharacterName(trimmed);
}

export function isReplicaLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (
    isEmotionLine(trimmed) ||
    isActionBlock(trimmed) ||
    isCharacterNameLine(trimmed)
  ) {
    return false;
  }
  if (/^\*\*.+\*\*$/.test(trimmed)) return true;
  if (/[?!…]$/.test(trimmed)) return true;
  if (/\.{3}$/.test(trimmed)) return true;
  if (/[.]$/.test(trimmed) && /[а-яёa-z]/i.test(trimmed)) return true;
  if (/^[«"'].*[»"']$/.test(trimmed)) return true;
  return /[а-яёa-z]/.test(trimmed);
}

function normalizeCharacterName(name: string): string {
  return name.trim().toUpperCase();
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

export function extractPotentialCharacterName(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || isActionBlock(trimmed) || isEmotionLine(trimmed)) {
    return null;
  }
  if (ORDINAL_NOUN_PATTERN.test(trimmed)) {
    return normalizeCharacterName(trimmed);
  }
  if (/^[А-ЯЁA-Z]{1,20}$/.test(trimmed)) {
    return normalizeCharacterName(trimmed);
  }
  const inlineDialogue = trimmed.match(
    /^([А-ЯЁA-Z][А-ЯЁA-Z\s]{0,30}?)(?:\s*\([^)]+\))?\s+.+$/
  );
  if (inlineDialogue) {
    return normalizeCharacterName(inlineDialogue[1]);
  }
  return null;
}

export function parseSingleBlockDialogue(
  fullText: string
): { characterName: string } | null {
  const lines = splitLines(fullText);
  if (lines.length === 0) return null;

  if (lines.length === 1) {
    const line = lines[0];
    const inline = line.match(
      /^([А-ЯЁA-Z][А-ЯЁA-Z\s]{0,30}?)\s*(\([^)]+\))?\s+(.+)$/
    );
    if (!inline) return null;
    const characterName = normalizeCharacterName(inline[1]);
    const replica = inline[3]?.trim();
    if (!replica || isActionBlock(replica)) return null;
    return { characterName };
  }

  const firstName = extractPotentialCharacterName(lines[0]);
  if (!firstName) return null;

  const second = lines[1];
  const third = lines[2];
  if (lines.length === 2) {
    if (isEmotionLine(second) || isReplicaLine(second)) {
      return { characterName: firstName };
    }
    return null;
  }
  if (lines.length >= 3 && isEmotionLine(second) && isReplicaLine(third)) {
    return { characterName: firstName };
  }
  return null;
}

export function buildScriptLines(blocks: TextBlockEntry[]): ScriptLine[] {
  const result: ScriptLine[] = [];
  let flatIndex = 0;

  for (const block of blocks) {
    const full = block.fullText;
    if (!full.trim()) continue;

    let searchFrom = 0;
    const parts = full.split('\n');
    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const rawPart = parts[partIndex];
      const trimmed = rawPart.trim();
      if (!trimmed) {
        searchFrom += rawPart.length + (partIndex < parts.length - 1 ? 1 : 0);
        continue;
      }
      const start = full.indexOf(trimmed, searchFrom);
      const end = start + trimmed.length;
      result.push({
        flatIndex,
        blockIndex: block.index,
        content: trimmed,
        start,
        end,
        text: block.text,
      });
      flatIndex++;
      searchFrom = end;
    }
  }

  return result;
}

export function detectDialogueBlocks(blocks: TextBlockEntry[]): BlockToColor[] {
  const lines = buildScriptLines(blocks);
  const result: BlockToColor[] = [];
  let index = 0;

  const pushLine = (line: ScriptLine, characterName: string) => {
    result.push({
      blockIndex: line.blockIndex,
      characterName,
      start: line.start,
      end: line.end,
    });
  };

  while (index < lines.length) {
    const line = lines[index];
    const content = line.content;

    if (!content.trim() || isActionBlock(content)) {
      index++;
      continue;
    }

    const singleBlockDialogue = parseSingleBlockDialogue(content);
    if (singleBlockDialogue) {
      pushLine(line, singleBlockDialogue.characterName);
      index++;
      continue;
    }

    const nameFromLine = extractPotentialCharacterName(content);
    if (!nameFromLine || !isCharacterNameLine(content)) {
      index++;
      continue;
    }

    const characterName = nameFromLine;
    pushLine(line, characterName);

    let cursor = index + 1;
    if (cursor < lines.length && isEmotionLine(lines[cursor].content)) {
      pushLine(lines[cursor], characterName);
      cursor++;
    }

    while (cursor < lines.length) {
      const next = lines[cursor];
      const nextText = next.content;
      if (!nextText.trim() || isActionBlock(nextText)) break;

      if (isCharacterNameLine(nextText)) break;
      if (isEmotionLine(nextText) && cursor > index + 1) break;

      pushLine(next, characterName);
      cursor++;

      if (isReplicaLine(nextText)) {
        while (cursor < lines.length) {
          const continuation = lines[cursor];
          const continuationText = continuation.content;
          if (!continuationText.trim() || isActionBlock(continuationText))
            break;
          if (isCharacterNameLine(continuationText)) break;
          if (isEmotionLine(continuationText)) break;
          pushLine(continuation, characterName);
          cursor++;
        }
        break;
      }
    }

    index = cursor;
  }

  return result;
}

export function getFixedCharacterColor(
  name: string
): HighlightColorName | null {
  return FIXED_CHARACTER_COLORS[normalizeCharacterName(name)] ?? null;
}

export function getRandomColor(
  used: Set<HighlightColorName>
): HighlightColorName {
  const available = AVAILABLE_COLORS.filter(color => !used.has(color));
  if (available.length === 0) return 'grey';
  return available[Math.floor(Math.random() * available.length)]!;
}

export function assignCharacterColors(
  blocksToColor: BlockToColor[]
): Record<string, HighlightColorName> {
  const uniqueNames = [
    ...new Set(blocksToColor.map(item => item.characterName)),
  ];
  const assigned: Record<string, HighlightColorName> = {};
  const used = new Set<HighlightColorName>();

  for (const name of uniqueNames) {
    const fixed = getFixedCharacterColor(name);
    if (fixed) {
      assigned[name] = fixed;
      used.add(fixed);
      continue;
    }
    const random = getRandomColor(used);
    assigned[name] = random;
    used.add(random);
  }

  for (let iteration = 0; iteration < 10; iteration++) {
    const groups = new Map<HighlightColorName, string[]>();
    for (const [name, color] of Object.entries(assigned)) {
      const bucket = groups.get(color) ?? [];
      bucket.push(name);
      groups.set(color, bucket);
    }
    let changed = false;
    for (const [color, names] of groups) {
      if (names.length <= 1) continue;
      const toRecolor =
        names.find(
          name => !getFixedCharacterColor(name) && !MAIN_CHARACTERS.has(name)
        ) ?? names.find(name => !getFixedCharacterColor(name));
      if (!toRecolor) continue;
      const nextColor = getRandomColor(new Set(Object.values(assigned)));
      if (nextColor === color) continue;
      assigned[toRecolor] = nextColor;
      changed = true;
    }
    if (!changed) break;
  }

  return assigned;
}

export function collectTextBlocksInOrder(store: Store): TextBlockEntry[] {
  const result: TextBlockEntry[] = [];

  const visit = (model: BlockModel) => {
    if (TEXT_BLOCK_FLAVOURS.has(model.flavour)) {
      const text = (model.props as { text?: Text }).text;
      if (text) {
        result.push({
          index: result.length,
          blockId: model.id,
          text,
          fullText: getPlainTextFromText(text),
        });
      }
    }
    for (const child of model.children) {
      visit(child);
    }
  };

  const root = store.root;
  if (root) visit(root);
  return result;
}

export function applyColorToTextRange(
  text: Text,
  start: number,
  end: number,
  color: HighlightColorName
) {
  const length = end - start;
  if (length <= 0 || start < 0 || end > text.length) return;
  const attributes: AffineTextStyleAttributes = {
    bold: true,
    color: toHighlightCssVar(color),
  };
  text.format(start, length, attributes);
}

export function executeColorCharactersAction(input: {
  host: EditorHost;
}): { ok: true; coloredBlocks: number } | { ok: false; message: string } {
  const { host } = input;

  const blocks = collectTextBlocksInOrder(host.store);
  const blocksToColor = detectDialogueBlocks(blocks);
  if (blocksToColor.length === 0) {
    return { ok: false, message: 'No dialogue blocks found on this page' };
  }

  const colorMap = assignCharacterColors(blocksToColor);

  host.store.captureSync();
  host.store.transact(() => {
    for (const item of blocksToColor) {
      const block = blocks[item.blockIndex];
      if (!block) continue;
      const color = colorMap[item.characterName];
      if (!color) continue;
      applyColorToTextRange(block.text, item.start, item.end, color);
    }
  });

  return { ok: true, coloredBlocks: blocksToColor.length };
}
