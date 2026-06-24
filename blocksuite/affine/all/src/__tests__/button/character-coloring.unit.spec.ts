import {
  assignCharacterColors,
  buildScriptLines,
  collectTextBlocksInOrder,
  detectDialogueBlocks,
  extractPotentialCharacterName,
  isActionBlock,
  isCharacterNameLine,
  isReplicaLine,
  parseSingleBlockDialogue,
  type TextBlockEntry,
  translateColorName,
} from '@blocksuite/affine-block-button';
import {
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import { Text } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { describe, expect, test } from 'vitest';

function entry(fullText: string, index = 0): TextBlockEntry {
  return {
    index,
    blockId: `block-${index}`,
    text: new Text(fullText),
    fullText,
  };
}

const USER_SCRIPT_BLOCKS = [
  'СЦЕНА 1 — ФИЗРУК И ВАФЕЛЬКА ВЫСЛЕЖИВАЮТ',
  'Кадр . Физрук и Вафелька крадутся.',
  'ФИЗРУК',
  '(Нюхает воздух)',
  'Я чую кошачий запах...',
  'ВАФЕЛЬКА',
  '(Хрустит пальцами)',
  'Пахнет добычей.',
  'Много добычи.',
  '───',
  'СЦЕНА 2 — ПОРТАЛ ОТКРЫВАЕТСЯ',
  'Чёрный экран. Гул. Включается зелёный портал.',
  'СИМБА',
  '(Удивлённо)',
  'Что за...',
  'БЕНЧИК',
  '(Шёпотом, трясётся)',
].map((text, index) => entry(text, index));

describe('character coloring parser', () => {
  test('detects action blocks', () => {
    expect(isActionBlock('Кадр снаружи снаружи')).toBe(true);
    expect(isActionBlock('Кадр . Физрук и Вафелька крадутся.')).toBe(true);
    expect(isActionBlock('СЦЕНА 1 — ФИЗРУК И ВАФЕЛЬКА')).toBe(true);
    expect(isActionBlock('ФИЗРУК')).toBe(false);
  });

  test('distinguishes character names from replica lines', () => {
    expect(isCharacterNameLine('ФИЗРУК')).toBe(true);
    expect(isCharacterNameLine('ВАФЕЛЬКА')).toBe(true);
    expect(isReplicaLine('ФИЗРУК')).toBe(false);
    expect(isReplicaLine('Пахнет добычей.')).toBe(true);
    expect(isReplicaLine('Я чую кошачий запах...')).toBe(true);
  });

  test('extracts character names', () => {
    expect(extractPotentialCharacterName('ФИЗРУК')).toBe('ФИЗРУК');
    expect(extractPotentialCharacterName('ПЕРВЫЙ КОТ')).toBe('ПЕРВЫЙ КОТ');
    expect(extractPotentialCharacterName('(радостно)')).toBeNull();
  });

  test('parses inline dialogue in one block', () => {
    expect(
      parseSingleBlockDialogue('ФИЗРУК (Нюхает воздух) Я чую кошачий запах...')
    ).toEqual({ characterName: 'ФИЗРУК' });
    expect(parseSingleBlockDialogue('ТИГРА\nЧто случилось?')).toEqual({
      characterName: 'ТИГРА',
    });
    expect(parseSingleBlockDialogue('СИМБА\n(грустно)\nЯ устал.')).toEqual({
      characterName: 'СИМБА',
    });
  });

  test('detects multi-block dialogue', () => {
    const blocks = [
      entry('СИМБА'),
      entry('(грустно)', 1),
      entry('Я устал.', 2),
    ];
    const result = detectDialogueBlocks(blocks);
    expect(result).toHaveLength(3);
    expect(result.every(item => item.characterName === 'СИМБА')).toBe(true);
  });

  test('parses user screenplay format with one line per paragraph', () => {
    const result = detectDialogueBlocks(USER_SCRIPT_BLOCKS);
    const names = [...new Set(result.map(item => item.characterName))];
    expect(names).toContain('ФИЗРУК');
    expect(names).toContain('ВАФЕЛЬКА');
    expect(names).toContain('СИМБА');
    expect(names).toContain('БЕНЧИК');
    expect(result.some(item => item.characterName === 'ФИЗРУК')).toBe(true);
    expect(result.some(item => item.characterName === 'ВАФЕЛЬКА')).toBe(true);
    expect(
      result.some(
        item =>
          USER_SCRIPT_BLOCKS[item.blockIndex]?.fullText === 'Много добычи.' &&
          item.characterName === 'ВАФЕЛЬКА'
      )
    ).toBe(true);
  });

  test('parses user screenplay pasted into one paragraph', () => {
    const script = USER_SCRIPT_BLOCKS.map(block => block.fullText).join('\n');
    const blocks = [entry(script)];
    const lines = buildScriptLines(blocks);
    expect(lines.length).toBeGreaterThan(10);
    const result = detectDialogueBlocks(blocks);
    expect(result.some(item => item.characterName === 'ФИЗРУК')).toBe(true);
    expect(result.some(item => item.characterName === 'СИМБА')).toBe(true);
  });

  test('skips action blocks between dialogues', () => {
    const blocks = [
      entry('ВАФЕЛЬКА'),
      entry('Пахнет добычей.', 1),
      entry('Кадр снаружи', 2),
      entry('ТИГРА', 3),
      entry('Стоп!', 4),
    ];
    const result = detectDialogueBlocks(blocks);
    expect(result).toContainEqual(
      expect.objectContaining({ blockIndex: 0, characterName: 'ВАФЕЛЬКА' })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ blockIndex: 1, characterName: 'ВАФЕЛЬКА' })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ blockIndex: 3, characterName: 'ТИГРА' })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ blockIndex: 4, characterName: 'ТИГРА' })
    );
    expect(result.some(item => item.blockIndex === 2)).toBe(false);
  });
});

describe('character coloring store collection', () => {
  const extensions = [
    RootBlockSchemaExtension,
    NoteBlockSchemaExtension,
    ParagraphBlockSchemaExtension,
  ];

  test('collects paragraph blocks from a real document store', () => {
    const workspace = new TestWorkspace({
      id: 'ws',
      idGenerator: createAutoIncrementIdGenerator(),
    });
    workspace.meta.initialize();
    const doc = workspace.createDoc('script-doc');
    doc.load();
    const store = doc.getStore({ id: 'script-doc', extensions });
    const rootId = store.addBlock('affine:page', { title: new Text('Script') });
    const noteId = store.addBlock('affine:note', {}, rootId);

    for (const line of [
      'ФИЗРУК',
      '(Нюхает воздух)',
      'Я чую кошачий запах...',
      'ВАФЕЛЬКА',
      'Пахнет добычей.',
    ]) {
      const paragraphId = store.addBlock('affine:paragraph', {}, noteId);
      const paragraph = store.getBlock(paragraphId)?.model;
      paragraph?.text?.insert(line, 0);
    }

    const blocks = collectTextBlocksInOrder(store);
    expect(blocks).toHaveLength(5);
    expect(detectDialogueBlocks(blocks).length).toBeGreaterThan(0);
  });
});

describe('character coloring colors', () => {
  test('translates color names', () => {
    expect(translateColorName('orange')).toBe('orange');
    expect(translateColorName('оранжевый')).toBe('orange');
    expect(translateColorName('brown')).toBe('orange');
    expect(translateColorName('default')).toBeNull();
  });

  test('assigns fixed colors and random for others', () => {
    const blocksToColor = [
      { blockIndex: 0, characterName: 'СИМБА', start: 0, end: 5 },
      { blockIndex: 1, characterName: 'ФИЗРУК', start: 0, end: 6 },
      { blockIndex: 2, characterName: 'ТИГРА', start: 0, end: 5 },
    ];
    const assigned = assignCharacterColors(blocksToColor);
    expect(assigned.СИМБА).toBe('orange');
    expect(assigned.ТИГРА).toBe('red');
    expect(assigned.ФИЗРУК).toBeDefined();
    expect(assigned.ФИЗРУК).not.toBe('orange');
    expect(assigned.ФИЗРУК).not.toBe('red');
  });
});
