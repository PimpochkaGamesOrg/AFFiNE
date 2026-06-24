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
  index: number;
  characterName: string;
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
  return (
    /^кадр\s/i.test(trimmed) ||
    /^отрывок\s+из/i.test(trimmed) ||
    /^смена\s+ракурса/i.test(trimmed) ||
    /^по\s+графу/i.test(trimmed) ||
    /^тут\s+же/i.test(trimmed) ||
    /!\[/.test(trimmed) ||
    /^сцена\s+\d+/i.test(trimmed) ||
    trimmed.startsWith('───') ||
    trimmed.startsWith('---')
  );
}

export function isEmotionLine(text: string): boolean {
  return /^\([^)]+\)$/.test(text.trim());
}

export function isReplicaLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^\*\*.+\*\*$/.test(trimmed)) return true;
  if (/[?!…]$/.test(trimmed)) return true;
  if (/^[«"'].*[»"']$/.test(trimmed)) return true;
  return (
    trimmed.length > 0 && !isEmotionLine(trimmed) && !isActionBlock(trimmed)
  );
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

export function detectDialogueBlocks(blocks: TextBlockEntry[]): BlockToColor[] {
  const result: BlockToColor[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];
    const fullText = block.fullText;

    if (!fullText.trim() || isActionBlock(fullText)) {
      index++;
      continue;
    }

    const singleBlockDialogue = parseSingleBlockDialogue(fullText);
    if (singleBlockDialogue) {
      result.push({ index, characterName: singleBlockDialogue.characterName });
      index++;
      continue;
    }

    const lines = splitLines(fullText);
    const nameFromFirstLine = extractPotentialCharacterName(lines[0] ?? '');
    if (!nameFromFirstLine || lines.length !== 1) {
      index++;
      continue;
    }

    const characterName = nameFromFirstLine;
    result.push({ index, characterName });

    let cursor = index + 1;
    if (
      cursor < blocks.length &&
      isEmotionLine(blocks[cursor].fullText) &&
      splitLines(blocks[cursor].fullText).length === 1
    ) {
      result.push({ index: cursor, characterName });
      cursor++;
    }

    while (cursor < blocks.length) {
      const next = blocks[cursor];
      const nextText = next.fullText;
      if (!nextText.trim() || isActionBlock(nextText)) break;

      const nextLines = splitLines(nextText);
      const nextName = extractPotentialCharacterName(nextLines[0] ?? '');
      if (
        nextName &&
        nextLines.length === 1 &&
        !isReplicaLine(nextText) &&
        !isEmotionLine(nextText)
      ) {
        break;
      }
      if (isEmotionLine(nextText) && cursor > index + 1) break;

      result.push({ index: cursor, characterName });
      cursor++;

      if (isReplicaLine(nextText)) {
        while (cursor < blocks.length) {
          const continuation = blocks[cursor];
          const continuationText = continuation.fullText;
          if (!continuationText.trim() || isActionBlock(continuationText))
            break;
          const continuationLines = splitLines(continuationText);
          const continuationName = extractPotentialCharacterName(
            continuationLines[0] ?? ''
          );
          if (
            continuationName &&
            continuationLines.length === 1 &&
            !isReplicaLine(continuationText)
          ) {
            break;
          }
          if (isEmotionLine(continuationText)) break;
          result.push({ index: cursor, characterName });
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
    for (const childId of model.children) {
      const child = store.getBlock(childId)?.model;
      if (child) visit(child);
    }
  };

  const root = store.root;
  if (root) visit(root);
  return result;
}

export function applyColorToText(text: Text, color: HighlightColorName) {
  if (text.length === 0) return;
  const attributes: AffineTextStyleAttributes = {
    bold: true,
    color: toHighlightCssVar(color),
  };
  text.format(0, text.length, attributes);
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
      const block = blocks[item.index];
      if (!block) continue;
      const color = colorMap[item.characterName];
      if (!color) continue;
      applyColorToText(block.text, color);
    }
  });

  return { ok: true, coloredBlocks: blocksToColor.length };
}
