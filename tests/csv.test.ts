import { describe, it, expect } from 'vitest';
import { guardCell, parseCsv, toCsv, unguardCell } from '@/src/lib/csv';

const BOM = String.fromCharCode(0xfeff);

describe('csv reader', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles Windows line ends and a missing final newline', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles quotes, doubled quotes, commas and line breaks inside a cell', () => {
    const csv = 'name,note\n"Pad, front","He said ""fits"""\n"Two\nlines",x\n';
    expect(parseCsv(csv)).toEqual([
      ['name', 'note'],
      ['Pad, front', 'He said "fits"'],
      ['Two\nlines', 'x'],
    ]);
  });

  it('strips the byte-order mark Excel adds', () => {
    expect(parseCsv(BOM + 'sku,name\nA,B\n')[0]).toEqual(['sku', 'name']);
  });

  it('skips blank lines but keeps empty cells', () => {
    expect(parseCsv('a,b,c\n\n1,,3\n,,\n')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });

  it('understands semicolon and tab separated files', () => {
    expect(parseCsv('a;b\n1;2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('does not mistake commas inside quotes for the separator', () => {
    expect(parseCsv('"a;b;c",d\n1,2\n')).toEqual([['a;b;c', 'd'], ['1', '2']]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });
});

describe('csv writer', () => {
  it('quotes only when needed and uses CRLF with a BOM', () => {
    const out = toCsv([['a', 'b,c', 'say "hi"', 'x\ny', null, 5]]);
    expect(out.startsWith(BOM)).toBe(true);
    expect(out).toBe(BOM + 'a,"b,c","say ""hi""","x\ny",,5\r\n');
  });

  it('can leave out the BOM', () => {
    expect(toCsv([['a']], { bom: false })).toBe('a\r\n');
  });

  it('writes what the reader reads back', () => {
    const rows = [['sku', 'note'], ['A-1', 'comma, quote " and\nnewline'], ['B-2', '']];
    expect(parseCsv(toCsv(rows))).toEqual([['sku', 'note'], ['A-1', 'comma, quote " and\nnewline'], ['B-2', '']]);
  });
});

describe('spreadsheet formula guard', () => {
  it('neutralises cells that would run as formulas', () => {
    for (const bad of ['=SUM(A1)', '+1+1', '-2+3', '@cmd']) {
      expect(guardCell(bad)).toBe("'" + bad);
      expect(unguardCell(guardCell(bad))).toBe(bad);
    }
  });

  it('leaves normal text alone', () => {
    expect(guardCell('Front Brake Pad')).toBe('Front Brake Pad');
    expect(unguardCell('Front Brake Pad')).toBe('Front Brake Pad');
    expect(unguardCell("O'Brien")).toBe("O'Brien");
  });
});
