import {
  assignCharacterColors,
  detectDialogueBlocks,
  extractPotentialCharacterName,
  isActionBlock,
  parseSingleBlockDialogue,
  type TextBlockEntry,
  translateColorName,
} from '@blocksuite/affine-block-button';
import { Text } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';

function entry(fullText: string, index = 0): TextBlockEntry {
  return {
    index,
    blockId: `block-${index}`,
    text: new Text(fullText),
    fullText,
  };
}

describe('character coloring parser', () => {
  test('detects action blocks', () => {
    expect(isActionBlock('Кадр снаружи снаружи')).toBe(true);
    expect(isActionBlock('СЦЕНА 1 — ФИЗРУК И ВАФЕЛЬКА')).toBe(true);
    expect(isActionBlock('ФИЗРУК')).toBe(false);
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
    expect(detectDialogueBlocks(blocks)).toEqual([
      { index: 0, characterName: 'СИМБА' },
      { index: 1, characterName: 'СИМБА' },
      { index: 2, characterName: 'СИМБА' },
    ]);
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
    expect(result).toContainEqual({ index: 0, characterName: 'ВАФЕЛЬКА' });
    expect(result).toContainEqual({ index: 1, characterName: 'ВАФЕЛЬКА' });
    expect(result).toContainEqual({ index: 3, characterName: 'ТИГРА' });
    expect(result).toContainEqual({ index: 4, characterName: 'ТИГРА' });
    expect(result.some(item => item.index === 2)).toBe(false);
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
      { index: 0, characterName: 'СИМБА' },
      { index: 1, characterName: 'ФИЗРУК' },
      { index: 2, characterName: 'ТИГРА' },
    ];
    const assigned = assignCharacterColors(blocksToColor);
    expect(assigned.СИМБА).toBe('orange');
    expect(assigned.ТИГРА).toBe('red');
    expect(assigned.ФИЗРУК).toBeDefined();
    expect(assigned.ФИЗРУК).not.toBe('orange');
    expect(assigned.ФИЗРУК).not.toBe('red');
  });
});
