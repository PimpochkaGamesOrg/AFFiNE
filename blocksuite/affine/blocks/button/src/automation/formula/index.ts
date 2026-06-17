import type { ButtonValueExpression } from '@blocksuite/affine-model';

export type FormulaWarning = {
  message: string;
  severity: 'warning' | 'error';
};

export type FormulaToken =
  | { kind: 'text'; value: string }
  | { kind: 'ref'; label: string; expr: ButtonValueExpression }
  | { kind: 'op'; value: '+' }
  | { kind: 'func'; name: string; args: FormulaToken[][] };

const trim = (value: string) => value.trim();

function parseStringLiteral(input: string, index: number) {
  const quote = input[index];
  if (quote !== '"' && quote !== "'") return null;
  let i = index + 1;
  let value = '';
  while (i < input.length) {
    const ch = input[i];
    if (ch === '\\' && i + 1 < input.length) {
      value += input[i + 1];
      i += 2;
      continue;
    }
    if (ch === quote) {
      return { value, next: i + 1 };
    }
    value += ch;
    i += 1;
  }
  return null;
}

function skipSpace(input: string, index: number) {
  while (index < input.length && /\s/.test(input[index]!)) index += 1;
  return index;
}

function readIdent(input: string, index: number) {
  let i = index;
  while (i < input.length && /[A-Za-z0-9_-]/.test(input[i]!)) i += 1;
  if (i === index) return null;
  return { value: input.slice(index, i), next: i };
}

function readNumber(input: string, index: number) {
  let i = index;
  while (i < input.length && /[0-9]/.test(input[i]!)) i += 1;
  if (i === index) return null;
  return { value: Number(input.slice(index, i)), next: i };
}

function matchKeyword(input: string, index: number, keyword: string) {
  const i = skipSpace(input, index);
  if (
    input.slice(i, i + keyword.length).toLowerCase() !== keyword.toLowerCase()
  ) {
    return null;
  }
  const after = i + keyword.length;
  if (after < input.length && /[A-Za-z0-9_]/.test(input[after]!)) return null;
  return after;
}

function parsePrimary(
  input: string,
  index: number
): {
  expr: ButtonValueExpression;
  next: number;
} | null {
  let i = skipSpace(input, index);

  const str = parseStringLiteral(input, i);
  if (str) {
    return { expr: { type: 'literal', value: str.value }, next: str.next };
  }

  const ifPos = matchKeyword(input, i, 'if');
  if (ifPos != null) {
    i = skipSpace(input, ifPos);
    if (input[i] !== '(') return null;
    const cond = parseExpr(input, i + 1);
    if (!cond) return null;
    i = skipSpace(input, cond.next);
    if (input[i] !== ',') return null;
    const thenExpr = parseExpr(input, i + 1);
    if (!thenExpr) return null;
    i = skipSpace(input, thenExpr.next);
    if (input[i] !== ',') return null;
    const elseExpr = parseExpr(input, i + 1);
    if (!elseExpr) return null;
    i = skipSpace(input, elseExpr.next);
    if (input[i] !== ')') return null;

    if (cond.expr.type === 'empty') {
      return {
        expr: {
          type: 'if_empty',
          value: cond.expr.value,
          // oxlint-disable-next-line unicorn/no-thenable
          then: thenExpr.expr,
          else: elseExpr.expr,
        },
        next: i + 1,
      };
    }
    if (cond.expr.type === 'not_empty') {
      return {
        expr: {
          type: 'if',
          condition: cond.expr,
          // oxlint-disable-next-line unicorn/no-thenable
          then: thenExpr.expr,
          else: elseExpr.expr,
        },
        next: i + 1,
      };
    }
    return {
      expr: {
        type: 'if',
        condition: cond.expr,
        // oxlint-disable-next-line unicorn/no-thenable
        then: thenExpr.expr,
        else: elseExpr.expr,
      },
      next: i + 1,
    };
  }

  const emptyPos = matchKeyword(input, i, 'empty');
  if (emptyPos != null) {
    i = skipSpace(input, emptyPos);
    if (input[i] !== '(') return null;
    const inner = parseExpr(input, i + 1);
    if (!inner) return null;
    i = skipSpace(input, inner.next);
    if (input[i] !== ')') return null;
    return { expr: { type: 'empty', value: inner.expr }, next: i + 1 };
  }

  const dateRangePos = matchKeyword(input, i, 'dateRange');
  if (dateRangePos != null) {
    i = skipSpace(input, dateRangePos);
    if (input[i] !== '(') return null;
    const start = parseExpr(input, i + 1);
    if (!start) return null;
    i = skipSpace(input, start.next);
    if (input[i] !== ',') return null;
    const end = parseExpr(input, i + 1);
    if (!end) return null;
    i = skipSpace(input, end.next);
    if (input[i] !== ')') return null;
    return {
      expr: { type: 'date_range', start: start.expr, end: end.expr },
      next: i + 1,
    };
  }

  const thisPagePos = matchKeyword(input, i, 'This page');
  if (thisPagePos != null) {
    i = skipSpace(input, thisPagePos);
    if (input[i] === "'") {
      i = skipSpace(input, i + 1);
      if (input[i]?.toLowerCase() === 's') {
        i = skipSpace(input, i + 1);
        const ident = readIdent(input, i);
        if (ident) {
          return {
            expr: { type: 'property', name: ident.value },
            next: ident.next,
          };
        }
      }
    }
    if (input[i] === '.') {
      i = skipSpace(input, i + 1);
      const ident = readIdent(input, i);
      if (ident) {
        return {
          expr: {
            type: 'property',
            name: ident.value === 'Name' ? 'Name' : ident.value,
          },
          next: ident.next,
        };
      }
    }
    const ident = readIdent(input, i);
    if (ident && ident.value.toLowerCase() !== 'added') {
      return {
        expr: { type: 'property', name: ident.value },
        next: ident.next,
      };
    }
    return { expr: { type: 'this_page' }, next: i };
  }

  const stepPos = matchKeyword(input, i, 'Page added in step');
  if (stepPos != null) {
    i = skipSpace(input, stepPos);
    const num = readNumber(input, i);
    if (!num) return null;
    return {
      expr: { type: 'step_result', step: num.value },
      next: num.next,
    };
  }

  const stepShort = matchKeyword(input, i, 'step');
  if (stepShort != null) {
    i = skipSpace(input, stepShort);
    const num = readNumber(input, i);
    if (num) {
      return {
        expr: { type: 'step_result', step: num.value },
        next: num.next,
      };
    }
  }

  const dateTriggeredPos = matchKeyword(input, i, 'Date triggered');
  if (dateTriggeredPos != null) {
    return { expr: { type: 'date_triggered' }, next: dateTriggeredPos };
  }

  if (input.slice(i, i + 2) === '🗓️') {
    i += 2;
    const dt = matchKeyword(input, i, 'Date triggered');
    if (dt != null) {
      return { expr: { type: 'date_triggered' }, next: dt };
    }
  }

  if (input[i] === '(') {
    const inner = parseExpr(input, i + 1);
    if (!inner) return null;
    i = skipSpace(input, inner.next);
    if (input[i] !== ')') return null;
    return { expr: inner.expr, next: i + 1 };
  }

  return null;
}

function parseExpr(
  input: string,
  index: number
): {
  expr: ButtonValueExpression;
  next: number;
} | null {
  let i = skipSpace(input, index);

  if (input[i] === '!') {
    i = skipSpace(input, i + 1);
    const emptyPos = matchKeyword(input, i, 'empty');
    if (emptyPos != null) {
      i = skipSpace(input, emptyPos);
      if (input[i] !== '(') return null;
      const inner = parseExpr(input, i + 1);
      if (!inner) return null;
      i = skipSpace(input, inner.next);
      if (input[i] !== ')') return null;
      return {
        expr: { type: 'not_empty', value: inner.expr },
        next: i + 1,
      };
    }
    const inner = parseExpr(input, i);
    if (!inner) return null;
    return {
      expr: { type: 'not_empty', value: inner.expr },
      next: inner.next,
    };
  }

  const first = parsePrimary(input, i);
  if (!first) return null;
  i = skipSpace(first.next);

  if (input[i] === '+') {
    const parts: ButtonValueExpression[] = [first.expr];
    while (input[i] === '+') {
      const nextPart = parsePrimary(input, i + 1);
      if (!nextPart) break;
      parts.push(nextPart.expr);
      i = skipSpace(nextPart.next);
    }
    return {
      expr: parts.length === 1 ? parts[0]! : { type: 'concat', parts },
      next: i,
    };
  }

  if (input[i] === '.') {
    i = skipSpace(input, i + 1);
    const ident = readIdent(input, i);
    if (!ident) return first;
    return {
      expr: {
        type: 'property_of',
        base:
          first.expr.type === 'this_page' ? { type: 'this_page' } : first.expr,
        name: ident.value,
      },
      next: ident.next,
    };
  }

  return first;
}

export function parseFormula(source: string): ButtonValueExpression {
  const trimmed = trim(source);
  if (!trimmed) return { type: 'literal', value: '' };

  if (trimmed === 'This page') {
    return { type: 'this_page' };
  }

  const parsed = parseExpr(trimmed, 0);
  if (!parsed) {
    return { type: 'formula', source: trimmed };
  }
  const rest = trim(trimmed.slice(parsed.next));
  if (rest.length > 0) {
    return { type: 'formula', source: trimmed };
  }
  return parsed.expr;
}

export function normalizeExpression(
  expr: ButtonValueExpression
): ButtonValueExpression {
  if (expr.type === 'formula') {
    return parseFormula(expr.source);
  }
  return expr;
}

export function isEmptyExpression(expr: ButtonValueExpression): boolean {
  switch (expr.type) {
    case 'literal':
      return expr.value.trim().length === 0;
    case 'this_page':
    case 'date_triggered':
      return false;
    case 'step_result':
      return false;
    case 'property':
    case 'property_of':
      return false;
    case 'concat':
      return expr.parts.every(isEmptyExpression);
    case 'if_empty':
    case 'if':
      return isEmptyExpression(expr.then) && isEmptyExpression(expr.else);
    case 'empty':
    case 'not_empty':
    case 'date_range':
    case 'not_empty_marker':
      return false;
    case 'formula':
      return expr.source.trim().length === 0;
    default:
      return false;
  }
}

export function analyzeFormula(expr: ButtonValueExpression): FormulaWarning[] {
  const normalized = normalizeExpression(expr);
  const warnings: FormulaWarning[] = [];

  const walk = (node: ButtonValueExpression, inDateRange = false) => {
    if (node.type === 'formula') {
      walk(parseFormula(node.source), inDateRange);
      return;
    }
    if (
      (node.type === 'property' || node.type === 'property_of') &&
      inDateRange
    ) {
      warnings.push({
        message: 'Called function on a value that may be empty.',
        severity: 'warning',
      });
    }
    if (node.type === 'date_range') {
      walk(node.start, true);
      walk(node.end, true);
      return;
    }
    if (node.type === 'concat') {
      node.parts.forEach(part => walk(part, inDateRange));
      return;
    }
    if (node.type === 'if_empty') {
      walk(node.value, inDateRange);
      walk(node.then, inDateRange);
      walk(node.else, inDateRange);
      return;
    }
    if (node.type === 'if') {
      walk(node.condition, inDateRange);
      walk(node.then, inDateRange);
      walk(node.else, inDateRange);
      return;
    }
    if (node.type === 'empty' || node.type === 'not_empty') {
      walk(node.value, inDateRange);
    }
    if (node.type === 'not_empty_marker') {
      walk(node.value, inDateRange);
    }
  };

  walk(normalized);
  return warnings;
}

export function expressionToTokens(
  expr: ButtonValueExpression
): FormulaToken[] {
  const normalized = normalizeExpression(expr);
  switch (normalized.type) {
    case 'literal':
      return normalized.value
        ? [{ kind: 'text', value: normalized.value }]
        : [];
    case 'this_page':
      return [{ kind: 'ref', label: 'This page', expr: normalized }];
    case 'property':
      return [
        {
          kind: 'ref',
          label: `This page.${normalized.name}`,
          expr: normalized,
        },
      ];
    case 'property_of': {
      const baseTokens = expressionToTokens(normalized.base);
      const baseLabel =
        baseTokens[0]?.kind === 'ref' ? baseTokens[0].label : 'This page';
      return [
        {
          kind: 'ref',
          label: `${baseLabel}.${normalized.name}`,
          expr: normalized,
        },
      ];
    }
    case 'step_result':
      return [
        {
          kind: 'ref',
          label: `(${normalized.step}) Page added in step ${normalized.step}`,
          expr: normalized,
        },
      ];
    case 'date_triggered':
      return [{ kind: 'ref', label: '🗓️ Date triggered', expr: normalized }];
    case 'date_range':
      return [
        {
          kind: 'func',
          name: 'dateRange',
          args: [
            expressionToTokens(normalized.start),
            expressionToTokens(normalized.end),
          ],
        },
      ];
    case 'concat':
      return normalized.parts.flatMap((part, index) => {
        const tokens = expressionToTokens(part);
        if (index === 0) return tokens;
        return [{ kind: 'op', value: '+' } as FormulaToken, ...tokens];
      });
    case 'if_empty': {
      const check =
        normalized.value.type === 'property'
          ? `empty(${expressionToDisplay(normalized.value)})`
          : 'empty(...)';
      return [
        {
          kind: 'func',
          name: `if(${check}, ...)`,
          args: [
            expressionToTokens(normalized.then),
            expressionToTokens(normalized.else),
          ],
        },
      ];
    }
    case 'not_empty_marker':
      return [
        ...(normalized.value.type === 'property'
          ? [{ kind: 'text' as const, value: '' }]
          : []),
        {
          kind: 'ref',
          label: `!empty(${normalized.value.type === 'property' ? normalized.value.name : '...'}) ? ${normalized.marker} : ❌`,
          expr: normalized,
        },
      ];
    case 'empty':
      return [
        {
          kind: 'func',
          name: 'empty',
          args: [expressionToTokens(normalized.value)],
        },
      ];
    case 'not_empty':
      return [
        {
          kind: 'func',
          name: '!empty',
          args: [expressionToTokens(normalized.value)],
        },
      ];
    case 'formula':
      return [{ kind: 'text', value: normalized.source }];
    default:
      return [];
  }
}

export function expressionToDisplay(expr: ButtonValueExpression): string {
  const normalized = normalizeExpression(expr);
  switch (normalized.type) {
    case 'literal':
      return `"${normalized.value.replace(/"/g, '\\"')}"`;
    case 'this_page':
      return 'This page';
    case 'property':
      return normalized.name === 'Name'
        ? 'This page.Name'
        : `This page.${normalized.name}`;
    case 'property_of': {
      const base = expressionToDisplay(normalized.base);
      return `${base}.${normalized.name}`;
    }
    case 'step_result':
      return `Page added in step ${normalized.step}`;
    case 'date_triggered':
      return '🗓️ Date triggered';
    case 'date_range':
      return `dateRange(${expressionToDisplay(normalized.start)}, ${expressionToDisplay(normalized.end)})`;
    case 'concat':
      return normalized.parts.map(expressionToDisplay).join(' + ');
    case 'if_empty':
      return `if(empty(${expressionToDisplay(normalized.value)}), ${expressionToDisplay(normalized.then)}, ${expressionToDisplay(normalized.else)})`;
    case 'if':
      return `if(${expressionToDisplay(normalized.condition)}, ${expressionToDisplay(normalized.then)}, ${expressionToDisplay(normalized.else)})`;
    case 'empty':
      return `empty(${expressionToDisplay(normalized.value)})`;
    case 'not_empty':
      return `!empty(${expressionToDisplay(normalized.value)})`;
    case 'not_empty_marker': {
      const prop =
        normalized.value.type === 'property'
          ? expressionToDisplay(normalized.value)
          : '...';
      return `"..." + if(!${prop}.empty(), "${normalized.marker}", "❌")`;
    }
    case 'formula':
      return normalized.source;
    default:
      return '';
  }
}

export function displayToExpression(source: string): ButtonValueExpression {
  return parseFormula(source);
}
