import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  COLORS, PdfDocument, fitLine, hexToRgb, textWidth, toWinAnsi, wrapText,
} from '../lib/pdf.js';
import { readPdf, pdfText } from './fixtures/pdfText.js';

const poppler = (() => {
  try {
    execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const sample = () => {
  const doc = new PdfDocument({ title: 'Sample', created: new Date('2026-10-12T15:00:00Z') });
  doc.heading('Hello');
  doc.paragraph('A paragraph of text.');
  return doc;
};

test('toWinAnsi: ASCII untouched, Windows-1252 letters and punctuation kept as their codes, the rest a question mark', () => {
  assert.equal(toWinAnsi('Plain text 123'), 'Plain text 123');
  assert.equal(toWinAnsi('José Núñez'), 'José Núñez');
  assert.equal(toWinAnsi('“Quoted” — it’s 5…'), '\u0093Quoted\u0094 \u0097 it\u0092s 5\u0085');
  assert.equal(toWinAnsi('€10'), '\u008010');
  assert.equal(toWinAnsi('日本語'), '???');
  assert.equal(toWinAnsi('hi 😀'), 'hi ?');
  assert.equal(toWinAnsi('a\tb\nc\rd'), 'a b c d', 'tabs and line breaks are spaces');
  assert.equal(toWinAnsi('a\u0000b\u0007c'), 'abc', 'control characters are dropped');
  assert.equal(toWinAnsi(null), '');
  assert.equal(toWinAnsi(undefined), '');
  assert.equal(toWinAnsi('ă'), 'a', 'an accent the encoding lacks is dropped from its letter');
});

test('toWinAnsi is idempotent, so converting already-converted text changes nothing', () => {
  for (const text of ['José Núñez', '“Quoted” — it’s 5…', '€10', '日本語 😀', 'ă ő ű']) {
    assert.equal(toWinAnsi(toWinAnsi(text)), toWinAnsi(text), text);
  }
});

test('textWidth: wider letters and bold take more room, and an empty string takes none', () => {
  assert.equal(textWidth('', 'regular', 10), 0);
  assert.ok(textWidth('WWW', 'regular', 10) > textWidth('iii', 'regular', 10));
  assert.ok(textWidth('Hello', 'bold', 10) > textWidth('Hello', 'regular', 10));
  assert.ok(Math.abs(textWidth('Hello', 'regular', 20) - 2 * textWidth('Hello', 'regular', 10)) < 1e-9, 'scales with the size');
  // Helvetica: a space is 278 units, so ten spaces at 10 points are 27.8 points wide.
  assert.ok(Math.abs(textWidth(' '.repeat(10), 'regular', 10) - 27.8) < 1e-9);
});

test('wrapText: breaks at spaces, never exceeds the width, and breaks inside a word wider than the line', () => {
  const width = 120;
  const lines = wrapText('The quick brown fox jumps over the lazy dog and keeps running far away', { size: 10, width });
  assert.ok(lines.length > 2);
  for (const line of lines) assert.ok(textWidth(line, 'regular', 10) <= width, line);
  assert.equal(lines.join(' '), 'The quick brown fox jumps over the lazy dog and keeps running far away');

  const address = 'person.with.a.rather.long.address.that.must.wrap.around@example-domain-name.com';
  const pieces = wrapText(address, { size: 10, width });
  assert.ok(pieces.length > 1);
  for (const piece of pieces) assert.ok(textWidth(piece, 'regular', 10) <= width, piece);
  assert.equal(pieces.join(''), address, 'nothing lost');

  assert.deepEqual(wrapText('', { size: 10, width }), ['']);
  assert.deepEqual(wrapText('one\ntwo', { size: 10, width }), ['one', 'two'], 'a line break is kept');
});

test('fitLine: the whole line when it fits, otherwise cut with dots so it fits', () => {
  assert.equal(fitLine('Short', { size: 10, width: 200 }), 'Short');
  const cut = fitLine('A line that is much too long to fit in the room it was given', { size: 10, width: 100 });
  assert.ok(cut.endsWith('...'));
  assert.ok(textWidth(cut, 'regular', 10) <= 100);
});

test('hexToRgb: a six-digit colour, with or without the hash; anything else is the fallback', () => {
  assert.deepEqual(hexToRgb('#FF0000'), [1, 0, 0]);
  assert.deepEqual(hexToRgb('00ff00'), [0, 1, 0]);
  assert.deepEqual(hexToRgb('nonsense', [0.5, 0.5, 0.5]), [0.5, 0.5, 0.5]);
  assert.deepEqual(hexToRgb(undefined, [0, 0, 0]), [0, 0, 0]);
});

test('the file is a well-formed PDF: header, trailer, and a cross-reference table that points at every object', () => {
  const buffer = sample().finish();
  const raw = buffer.toString('latin1');
  assert.ok(raw.startsWith('%PDF-1.4\n'));
  assert.ok(raw.endsWith('%%EOF\n'));
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(raw)[1]);
  assert.ok(raw.slice(startxref).startsWith('xref\n'), 'startxref points at the table');
  const table = raw.slice(startxref).split('\n');
  const [first, count] = table[1].split(' ').map(Number);
  assert.equal(first, 0);
  for (let i = 1; i < count; i += 1) {
    const offset = Number(table[2 + i].slice(0, 10));
    assert.ok(raw.slice(offset).startsWith(`${i} 0 obj\n`), `object ${i} is where the table says`);
  }
  assert.match(raw, /\/Count 1 /);
  assert.match(raw, /\/Type \/Catalog/);
});

test('text is only ever written as hex strings, so nothing a visitor typed can be read as PDF syntax', () => {
  const doc = new PdfDocument();
  const hostile = ') Tj ET /Evil 0 0 Td (x) \\ << /AA >> endstream endobj';
  doc.paragraph(hostile);
  doc.table({ columns: [{ label: hostile, width: 1 }], rows: [[hostile], [[{ text: hostile, font: 'bold' }]]] });
  doc.heading(hostile);
  const buffer = doc.finish();
  const [page] = readPdf(buffer);
  assert.ok(!/\)\s*Tj/.test(page.ops), 'no parenthesised string is ever shown');
  assert.ok(!page.ops.includes('Evil'), 'the text is not in the stream as typed');
  assert.ok(page.lines.includes(hostile), 'but it comes back as the exact text');
  assert.ok(!buffer.toString('latin1').includes('/AA'), 'and appears nowhere else in the file');
});

test('document information is stored as UTF-16 hex, so a title with accents or quotes cannot break the file', () => {
  const doc = new PdfDocument({ title: 'Salt Grass “Phase 2” — José (ünder) \\ test', subject: 'a)b' });
  const raw = doc.finish().toString('latin1');
  const info = /\/Title (<[0-9A-F]+>)/.exec(raw);
  assert.ok(info, 'title is a hex string');
  assert.ok(info[1].startsWith('<FEFF'), 'with a byte-order mark');
  assert.ok(!raw.includes('(ünder)'));
});

test('a long table runs over onto more pages and repeats its header on each', () => {
  const doc = new PdfDocument();
  const rows = Array.from({ length: 160 }, (_, i) => [`Row ${i}`, [`line ${i} a`, `line ${i} b`]]);
  doc.table({ columns: [{ label: 'NAME', width: 1 }, { label: 'DETAIL', width: 2 }], rows });
  const pages = readPdf(doc.finish());
  assert.ok(pages.length >= 5, `${pages.length} pages`);
  for (const [index, page] of pages.entries()) {
    assert.ok(page.lines.includes('NAME') && page.lines.includes('DETAIL'), `page ${index + 1} has the header`);
  }
  const all = pages.flatMap((page) => page.lines);
  for (let i = 0; i < 160; i += 1) assert.ok(all.includes(`Row ${i}`), `row ${i} is somewhere`);
  assert.equal(all.filter((line) => line === 'Row 0').length, 1, 'and each row only once');
});

test('a row is never split across pages: its lines are drawn together on one page', () => {
  const doc = new PdfDocument();
  const rows = Array.from({ length: 60 }, (_, i) => [`R${i}`, [`A${i}`, `B${i}`, `C${i}`, `D${i}`]]);
  doc.table({ columns: [{ label: 'X', width: 1 }, { label: 'Y', width: 1 }], rows });
  for (const page of readPdf(doc.finish())) {
    for (const line of page.lines) {
      const m = /^A(\d+)$/.exec(line);
      if (m) for (const letter of ['B', 'C', 'D']) assert.ok(page.lines.includes(`${letter}${m[1]}`), `${letter}${m[1]} is with A${m[1]}`);
    }
  }
});

test('the footer is drawn on every page, once, with the right numbers, and the running header on every page but the first', () => {
  const doc = new PdfDocument();
  doc.onNewPage((d) => d.text('RUNNING HEAD', { y: 30 }));
  doc.setFooter((d, page, count) => d.text(`Page ${page} of ${count}`, { y: d.height - 30 }));
  for (let i = 0; i < 160; i += 1) doc.paragraph(`Line number ${i} of the body text that fills the pages.`);
  const pages = readPdf(doc.finish());
  assert.ok(pages.length >= 3);
  pages.forEach((page, i) => {
    assert.equal(page.lines.filter((l) => l === `Page ${i + 1} of ${pages.length}`).length, 1, `footer on page ${i + 1}`);
    assert.equal(page.lines.filter((l) => l === 'RUNNING HEAD').length, i === 0 ? 0 : 1, `running head on page ${i + 1}`);
  });
});

test('nothing is drawn below the bottom margin or past the right margin', () => {
  const doc = new PdfDocument();
  for (let i = 0; i < 120; i += 1) doc.paragraph(`Item ${i}: ${'word '.repeat(30)}`);
  const lowest = doc.height - doc.bottom;
  for (const page of readPdf(doc.finish())) {
    for (const m of page.ops.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/g)) {
      assert.ok(Number(m[2]) >= lowest - 12, `baseline ${m[2]} is inside the page`);
      assert.ok(Number(m[1]) <= doc.right, 'and starts inside the right margin');
    }
  }
});

test('a PDF reader opens the file, with the page count and title it should have', { skip: !poppler }, () => {
  const doc = new PdfDocument({ title: 'Reader “check” — José' });
  for (let i = 0; i < 80; i += 1) doc.paragraph(`Line ${i} café “quoted” €5`);
  const dir = mkdtempSync(join(tmpdir(), 'pdf-test-'));
  try {
    const file = join(dir, 'a.pdf');
    writeFileSync(file, doc.finish());
    const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
    assert.match(info, /Pages:\s+2/);
    assert.match(info, /Title:\s+Reader “check” — José/);
    const text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
    assert.ok(text.includes('Line 0 café “quoted” €5'));
    assert.ok(text.includes('Line 79 café “quoted” €5'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('COLORS are triples in the range 0 to 1', () => {
  for (const [name, rgb] of Object.entries(COLORS)) {
    assert.equal(rgb.length, 3, name);
    for (const c of rgb) assert.ok(c >= 0 && c <= 1, name);
  }
});

test('pdfText reads back what was written', () => {
  assert.match(pdfText(sample().finish()), /Hello\nA paragraph of text\./);
});

test('toWinAnsi: every kind of space is a space, the other hyphens are hyphens, and a few more letters keep their letter', () => {
  assert.equal(toWinAnsi('9:05 PM'), '9:05 PM', 'narrow no-break space (newer ICU writes one before AM/PM)');
  assert.equal(toWinAnsi('a b c　d e f g'), 'a b c d e f g');
  assert.equal(toWinAnsi('a‐b‑c‒d―e­f'), 'a-b-c-d-e-f');
  assert.equal(toWinAnsi('Łódź Đorđe ı'), 'Lódz Dorde i');
  assert.equal(toWinAnsi('–—'), '\u0096\u0097', 'the two dashes Windows-1252 has are kept');
  assert.equal(toWinAnsi('a​b'), 'ab', 'a zero-width space is dropped, not a gap');
});

test('wrapText and fitLine take linear time, so one enormous word cannot stall the server', () => {
  // 6,000 characters: a linear wrap takes a millisecond or two, a quadratic one many seconds, so a regression fails fast.
  const started = Date.now();
  const lines = wrapText('A'.repeat(6000), { size: 10, width: 150 });
  fitLine('B'.repeat(6000), { size: 10, width: 150 });
  fitLine(`${'word '.repeat(2000)}`, { size: 10, width: 150 });
  assert.ok(Date.now() - started < 300, `${Date.now() - started} ms`);
  for (const line of lines) assert.ok(textWidth(line, 'regular', 10) <= 150 + 1e-6);
  assert.equal(lines.join(''), 'A'.repeat(6000), 'and nothing was lost');
  // And a very large one still finishes at once.
  const big = Date.now();
  wrapText('C'.repeat(300000), { size: 10, width: 150 });
  assert.ok(Date.now() - big < 1500, `${Date.now() - big} ms`);
});

test('wrapText keeps every word of a long paragraph, in order', () => {
  const words = Array.from({ length: 3000 }, (_, i) => `w${i}`);
  const lines = wrapText(words.join(' '), { size: 9, width: 300 });
  assert.equal(lines.join(' ').split(' ').length, 3000);
  assert.equal(lines.join(' '), words.join(' '));
});

test('a table cell taller than a page is cut with dots, stays inside the margins, and the rest of the table is intact', () => {
  const doc = new PdfDocument();
  doc.setFooter((d, page, count) => d.text(`Page ${page} of ${count}`, { y: d.height - 38 }));
  const wall = Array.from({ length: 4000 }, (_, i) => `word${i}`).join(' ');
  doc.table({ columns: [{ label: 'A', width: 1 }, { label: 'B', width: 1 }], rows: [['first', 'ok'], [wall, 'beside the wall'], ['last', 'ok too']] });
  const pages = readPdf(doc.finish());
  const all = pages.flatMap((page) => page.lines);
  for (const wanted of ['first', 'beside the wall', 'last', 'ok too']) assert.ok(all.includes(wanted), wanted);
  assert.ok(all.some((line) => line.endsWith('...')), 'the wall is cut with dots');
  assert.ok(!all.includes('word3999'), 'and is not printed to the end');
  assert.ok(pages.length <= 3, `${pages.length} pages`);
  const lowest = doc.height - doc.bottom;
  for (const page of pages) {
    for (const m of page.ops.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm <([0-9A-F]*)> Tj/g)) {
      const text = Buffer.from(m[3], 'hex').toString('latin1');
      if (!/^Page \d+ of \d+$/.test(text)) assert.ok(Number(m[2]) >= lowest - 1, `"${text.slice(0, 20)}" at ${m[2]} is over the footer`);
    }
  }
});

test('a table never leaves its header alone at the foot of a page, wherever the page happens to end', () => {
  for (let fill = 0; fill < 70; fill += 1) {
    const doc = new PdfDocument();
    for (let i = 0; i < fill; i += 1) doc.paragraph(`Filler line ${i}`, { size: 10 });
    doc.table({ columns: [{ label: 'HEADCOL', width: 1 }, { label: 'OTHER', width: 1 }], rows: Array.from({ length: 12 }, (_, i) => [`Row ${i}`, [`a${i}`, `b${i}`, `c${i}`]]) });
    for (const [index, page] of readPdf(doc.finish()).entries()) {
      if (page.lines.includes('HEADCOL')) assert.ok(page.lines.some((line) => /^Row \d+$/.test(line)), `fill ${fill}, page ${index + 1}: a header with no row under it`);
    }
  }
});

test('a number too large for a coordinate is written as zero, never as an exponent a reader would reject', () => {
  const doc = new PdfDocument();
  doc.text('far away', { x: 1e21, y: 100 });
  doc.rect({ x: 0, y: 0, w: 1e30, h: 10, fill: [1, 0, 0] });
  const [page] = readPdf(doc.finish());
  assert.ok(!/\de[+-]?\d/i.test(page.ops), 'no exponent in the content stream');
});

test('the catalog names the language, and the corrected widths for ± µ · ÷ ¯ are Helvetica’s, not a symbol font’s', () => {
  assert.match(new PdfDocument().finish().toString('latin1'), /\/Type \/Catalog \/Pages 2 0 R \/Lang \(en-US\)/);
  const unit = (ch, font) => Math.round(textWidth(toWinAnsi(ch), font, 1000));
  assert.deepEqual(['±', '·', '÷', '¯', 'µ'].map((c) => unit(c, 'regular')), [584, 278, 584, 333, 556]);
  assert.deepEqual(['±', '·', '÷', '¯', 'µ'].map((c) => unit(c, 'bold')), [584, 278, 584, 333, 611]);
  assert.deepEqual(['±', '·', '÷', '¯', 'µ'].map((c) => unit(c, 'italic')), [584, 278, 584, 333, 556]);
});

test('every width in the tables matches the real font, checked against a PDF reader’s own measurements', { skip: !poppler }, () => {
  for (const font of ['regular', 'bold', 'italic']) {
    const doc = new PdfDocument({ size: [3000, 4200], margin: 10 });
    const codes = [];
    for (let c = 33; c <= 255; c += 1) if (![127, 129, 141, 143, 144, 157, 160, 173].includes(c)) codes.push(c);
    codes.forEach((c, i) => doc.text(String.fromCharCode(c).repeat(10), { x: 10 + (i % 10) * 290, y: 50 + Math.floor(i / 10) * 60, size: 40, font }));
    const dir = mkdtempSync(join(tmpdir(), 'pdf-widths-'));
    try {
      const file = join(dir, `${font}.pdf`);
      writeFileSync(file, doc.finish());
      const html = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' });
      const seen = new Map();
      for (const m of html.matchAll(/<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">(.*?)<\/word>/g)) {
        const text = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        if ([...text].length === 10 && new Set(text).size === 1) seen.set(text[0], ((Number(m[2]) - Number(m[1])) / 10 / 40) * 1000);
      }
      let checked = 0;
      for (const c of codes) {
        const unicode = new TextDecoder('windows-1252').decode(Uint8Array.of(c));
        if (!seen.has(unicode)) continue;
        checked += 1;
        assert.ok(Math.abs(seen.get(unicode) - textWidth(String.fromCharCode(c), font, 1000)) <= 6, `${font} ${JSON.stringify(unicode)}: reader ${Math.round(seen.get(unicode))}, table ${textWidth(String.fromCharCode(c), font, 1000)}`);
      }
      assert.ok(checked > 150, `${font}: only ${checked} characters could be compared`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('text with letter spacing is wider by that much for every letter, and the spacing is set for that text only', () => {
  const doc = new PdfDocument();
  const plain = doc.text('ABCDE', { size: 10, x: 50, y: 100 });
  const spaced = doc.text('ABCDE', { size: 10, x: 50, y: 120, spacing: 1 });
  assert.ok(Math.abs(spaced - plain - 5) < 1e-9, '5 letters, 1 point each');
  const [page] = readPdf(doc.finish());
  assert.match(page.ops, /0 Tc 1 0 0 1 50 \d+ Tm/);
  assert.match(page.ops, /1 Tc 1 0 0 1 50 \d+ Tm/);
});

test('a stat strip: every figure, its label and its line underneath, with thin rules between the cells', () => {
  const doc = new PdfDocument({ margin: 36 });
  doc.statStrip([
    { value: '11', label: 'People', sub: '2 contacted' },
    { value: '0', label: 'A rather long label that must wrap' },
    { value: '82%', label: 'Agreed', sub: 'a long line that has to go onto a second line' },
  ]);
  const [page] = readPdf(doc.finish());
  for (const wanted of ['11', 'PEOPLE', '2 contacted', '0', '82%', 'AGREED']) assert.ok(page.lines.includes(wanted), wanted);
  assert.ok(page.lines.filter((l) => l.startsWith('A RATHER LONG LABEL')).length >= 1);
  assert.equal((page.ops.match(/ l S/g) ?? []).length, 2, 'two rules between three cells');
  assert.ok(doc.y > 36 + 30, 'and the cursor is below the strip');
});

test('a table can hold a boxed warning with a no sign, and a line in two styles', () => {
  const doc = new PdfDocument({ margin: 36 });
  doc.table({
    columns: [{ label: 'NAME', width: 1 }, { label: 'PHONE · CONSENT', width: 2 }],
    rows: [
      ['Ann', [{ text: 'No phone' }, { tag: true, text: 'DO NOT CALL · NEVER ASKED', size: 6.2 }]],
      ['Bo', [{ parts: [{ text: '(801) 555-0100 · ' }, { text: 'Agreed', font: 'bold' }] }]],
      ['Cy', [{ parts: [{ text: `${'x'.repeat(200)} · ` }, { text: 'Agreed', font: 'bold' }] }]],
    ],
    header: [0.1, 0.3, 0.2], rules: false,
  });
  const [page] = readPdf(doc.finish());
  assert.ok(page.lines.includes('DO NOT CALL · NEVER ASKED'));
  assert.ok(page.lines.includes('(801) 555-0100 · ') && page.lines.includes('Agreed'), 'two runs on one line');
  assert.ok(/ c /.test(page.ops) && / re S/.test(page.ops), 'a ring (curves) and a box (a stroked rectangle)');
  assert.ok(page.lines.some((l) => l.startsWith('xxxx') && l.endsWith('...')), 'a line too wide for its cell is cut with dots, not run over the next column');
  assert.equal(page.lines.filter((l) => l === 'Agreed').length, 1, 'and its second style is dropped with it');
});

test('a vertical rule and a no sign are plain path operators a reader accepts', { skip: !poppler }, () => {
  const doc = new PdfDocument();
  doc.vrule({ x: 100, y1: 100, y2: 200 });
  doc.prohibit({ cx: 200, cy: 150, r: 10 });
  doc.paragraph('shapes');
  const dir = mkdtempSync(join(tmpdir(), 'pdf-shapes-'));
  try {
    const file = join(dir, 's.pdf');
    writeFileSync(file, doc.finish());
    assert.match(execFileSync('pdfinfo', [file], { encoding: 'utf8' }), /Pages:\s+1/);
    execFileSync('pdftoppm', ['-r', '30', '-png', file, join(dir, 'p')]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
