import { deflateSync } from 'node:zlib';

/**
 * A small PDF writer for the reports: text, rules, boxes and tables on Letter pages.
 *
 * It uses the three standard Helvetica faces, which every PDF viewer already has, so nothing is embedded and
 * the app takes no dependency for this. The price is the character set: text is converted to Windows-1252
 * (every Western European letter, the euro sign, curly quotes and dashes), and anything else, such as an emoji
 * or a name in another script, is printed as "?" rather than breaking the file.
 *
 * Nothing typed by a visitor is ever written into the file as PDF syntax. Every string goes out as a hex string
 * (<48656C6C6F>), which has no characters to escape, so a name such as "(x) Tj /Evil" is only text.
 *
 * Positions the caller uses run down the page from the top-left corner, in points (1/72 inch); the writer
 * flips them into the PDF's own bottom-left origin. Letter size, 0.75 inch margins.
 */

/** Advance widths in 1/1000 em for the bytes 32 to 255 of Windows-1252, measured from the Helvetica-compatible faces. */
const WIDTHS = {
  regular: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 750,
    556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
    0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667,
    278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
    400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
    667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
    556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
  ],
  bold: [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 750,
    556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
    0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667,
    278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
    400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
    722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
    556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
    611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
  ],
  italic: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 750,
    556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0,
    0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667,
    278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
    400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
    667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
    722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
    556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
  ],
};

const FONT_NAMES = { regular: 'F1', bold: 'F2', italic: 'F3' };
const BASE_FONTS = { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' };

/** The codes Windows-1252 gives to characters that are not in Latin-1 (0x80 to 0x9F). */
const CP1252_EXTRA = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88],
  ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92], ['“', 0x93],
  ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b],
  ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);

/** A few symbols with a plain-text stand-in, so they do not turn into question marks. */
const STAND_INS = new Map([
  ['→', '->'], ['←', '<-'], ['✓', 'Yes'], ['✔', 'Yes'], ['×', 'x'], ['−', '-'],
  // Hyphens other than the one Windows-1252 has, and the soft hyphen.
  ['\u2010', '-'], ['\u2011', '-'], ['\u2012', '-'], ['\u2015', '-'], ['\u00ad', '-'],
  // Letters the encoding lacks, with the letter they are read as.
  ['Ł', 'L'], ['ł', 'l'], ['Đ', 'D'], ['đ', 'd'], ['ı', 'i'], ['Ħ', 'H'], ['ħ', 'h'],
]);
/** Every kind of space (a no-break space, a narrow one before "PM", a thin one, an ideographic one) and a line or paragraph separator. */
const UNICODE_SPACE = /^[\p{Zs}\u2028\u2029]$/u;

/**
 * Text as a string of single-byte characters, one per Windows-1252 code (converting it again changes nothing, so
 * callers need not track whether a string is converted). Line breaks and tabs become spaces
 * (the callers split on newlines before this), accents that the encoding lacks are dropped from their letter
 * (a combining mark is removed, "ă" becomes "a"), and everything else unknown becomes "?".
 */
export function toWinAnsi(value) {
  let out = '';
  for (const ch of String(value ?? '')) {
    const cp = ch.codePointAt(0);
    if (cp === 9 || cp === 10 || cp === 13) out += ' ';
    else if (cp < 32 || cp === 127) out += '';
    else if (cp <= 126) out += ch;
    else if (UNICODE_SPACE.test(ch)) out += ' ';
    else if (STAND_INS.has(ch)) out += STAND_INS.get(ch);
    else if (CP1252_EXTRA.has(ch)) out += String.fromCharCode(CP1252_EXTRA.get(ch));
    else if (cp >= 0xa0 && cp <= 0xff) out += ch;
    // Already a Windows-1252 code (this function runs again on text it has converted): keep it, except the five
    // codes the encoding leaves undefined.
    else if (cp >= 0x80 && cp <= 0x9f) out += [0x81, 0x8d, 0x8f, 0x90, 0x9d].includes(cp) ? '?' : ch;
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base !== ch && base.length === 1 && base.codePointAt(0) < 127 ? base : (cp >= 0x300 && cp <= 0x36f) || cp === 0x200b || cp === 0xfe0f ? '' : '?';
    }
  }
  return out;
}

/** The width of a converted string in points. */
export function textWidth(winAnsi, font = 'regular', size = 10) {
  const table = WIDTHS[font] ?? WIDTHS.regular;
  let units = 0;
  for (let i = 0; i < winAnsi.length; i += 1) {
    const code = winAnsi.charCodeAt(i);
    units += code >= 32 && code <= 255 ? (table[code - 32] || table[31]) : 0;
  }
  return (units * size) / 1000;
}

const hexOf = (winAnsi) => {
  let out = '';
  for (let i = 0; i < winAnsi.length; i += 1) out += winAnsi.charCodeAt(i).toString(16).padStart(2, '0');
  return out;
};
/** A text string for the document information: UTF-16 with a byte-order mark, as hex. */
const infoString = (value) => {
  let out = 'FEFF';
  for (const unit of String(value ?? '').replace(/[\u0000-\u001f]/g, ' ')) {
    for (let i = 0; i < unit.length; i += 1) out += unit.charCodeAt(i).toString(16).padStart(4, '0');
  }
  return `<${out.toUpperCase()}>`;
};
// A coordinate is never near a billion; an exponent ("1e+21") is not valid PDF, so such a value is zero.
const num = (value) => (Number.isFinite(value) && Math.abs(value) < 1e9 ? Number(value.toFixed(2)).toString() : '0');
const pdfDate = (date) => {
  const p = (n) => String(n).padStart(2, '0');
  return `D:${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
};
const colorOps = (rgb, stroke = false) => `${rgb.map((c) => num(Math.min(1, Math.max(0, c)))).join(' ')} ${stroke ? 'RG' : 'rg'}`;

/** Splits text into lines no wider than `width`, breaking at spaces and, for one long word (an address), inside it. */
export function wrapText(value, { font = 'regular', size = 10, width }) {
  const lines = [];
  for (const paragraph of String(value ?? '').split(/\r?\n/)) {
    const words = toWinAnsi(paragraph).split(' ').filter((w) => w !== '');
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    const flush = () => {
      if (line !== '') lines.push(line);
      line = '';
    };
    for (const word of words) {
      if (textWidth(word, font, size) > width) {
        flush();
        // A word wider than the line (an address): fill lines with as much of it as fits, in one pass.
        let piece = '';
        let used = 0;
        for (let i = 0; i < word.length; i += 1) {
          const w = textWidth(word[i], font, size);
          if (used + w > width && piece !== '') {
            lines.push(piece);
            piece = '';
            used = 0;
          }
          piece += word[i];
          used += w;
        }
        line = piece;
        continue;
      }
      const candidate = line === '' ? word : `${line} ${word}`;
      if (textWidth(candidate, font, size) <= width) line = candidate;
      else {
        flush();
        line = word;
      }
    }
    flush();
  }
  return lines;
}

/** Shortens one line with an ellipsis so it fits `width`. */
export function fitLine(value, { font = 'regular', size = 10, width }) {
  const text = toWinAnsi(value);
  if (textWidth(text, font, size) <= width) return text;
  const dots = '...';
  const room = width - textWidth(dots, font, size);
  let used = 0;
  let cut = 0;
  while (cut < text.length) {
    const w = textWidth(text[cut], font, size);
    if (used + w > room) break;
    used += w;
    cut += 1;
  }
  return text.slice(0, cut).trimEnd() + dots;
}

export const COLORS = {
  ink: [0.1, 0.11, 0.13],
  muted: [0.4, 0.42, 0.46],
  faint: [0.62, 0.64, 0.67],
  rule: [0.82, 0.83, 0.85],
  wash: [0.955, 0.96, 0.965],
  white: [1, 1, 1],
};

/** A "#RRGGBB" colour as an [r, g, b] list in 0 to 1. */
export function hexToRgb(hex, fallback = [0.12, 0.2, 0.3]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class PdfDocument {
  constructor({ title = '', subject = '', author = 'Touradoor', creator = 'Touradoor', margin = 54, size = [612, 792], created = new Date() } = {}) {
    this.info = { title, subject, author, creator };
    this.created = created;
    this.width = size[0];
    this.height = size[1];
    this.margin = margin;
    this.pages = [];
    this.pageHooks = [];
    this.footer = null;
    this.y = margin;
    this.addPage();
  }

  get left() { return this.margin; }
  get right() { return this.width - this.margin; }
  get contentWidth() { return this.width - this.margin * 2; }
  get bottom() { return this.height - this.margin - 18; }
  get pageNumber() { return this.pages.length; }

  /** A function called at the top of every page after the first, so a running header can be drawn. */
  onNewPage(fn) {
    this.pageHooks.push(fn);
  }

  /** A function called once per page when the document is finished, with (doc, pageNumber, pageCount). */
  setFooter(fn) {
    this.footer = fn;
  }

  addPage() {
    this.pages.push({ ops: [] });
    this.current = this.pages[this.pages.length - 1];
    this.y = this.margin;
    if (this.pages.length > 1) for (const hook of this.pageHooks) hook(this);
  }

  /** Starts a new page unless `height` points still fit on this one. */
  ensure(height) {
    if (this.y + height > this.bottom) this.addPage();
  }

  moveDown(points) {
    this.y += points;
  }

  // ── drawing, at explicit positions ─────────────────────────────────────

  /** One line of text with its baseline at `y`. `align` is relative to x and, for right and centre, to `width`. */
  text(value, { x = this.left, y = this.y, size = 10, font = 'regular', color = COLORS.ink, align = 'left', width = 0 } = {}) {
    const converted = toWinAnsi(value);
    if (converted === '') return 0;
    const w = textWidth(converted, font, size);
    let px = x;
    if (align === 'right') px = x + width - w;
    else if (align === 'center') px = x + (width - w) / 2;
    this.current.ops.push(
      `BT ${colorOps(color)} /${FONT_NAMES[font] ?? 'F1'} ${num(size)} Tf 1 0 0 1 ${num(px)} ${num(this.height - y)} Tm <${hexOf(converted)}> Tj ET`,
    );
    return w;
  }

  rule({ x1 = this.left, x2 = this.right, y = this.y, color = COLORS.rule, weight = 0.6 } = {}) {
    this.current.ops.push(`${colorOps(color, true)} ${num(weight)} w ${num(x1)} ${num(this.height - y)} m ${num(x2)} ${num(this.height - y)} l S`);
  }

  rect({ x, y, w, h, fill = null, stroke = null, weight = 0.6 }) {
    const ops = [];
    if (fill) ops.push(colorOps(fill));
    if (stroke) ops.push(colorOps(stroke, true), `${num(weight)} w`);
    ops.push(`${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    this.current.ops.push(ops.join(' '));
  }

  // ── flow: things that move the cursor and break pages ──────────────────

  /** A wrapped paragraph at the cursor; returns the number of lines. */
  paragraph(value, { size = 10, font = 'regular', color = COLORS.ink, leading = size * 1.35, x = this.left, width = this.right - x, gap = 0 } = {}) {
    const lines = wrapText(value, { font, size, width });
    for (const line of lines) {
      this.ensure(leading);
      this.text(line, { x, y: this.y + size, size, font, color });
      this.y += leading;
    }
    this.y += gap;
    return lines.length;
  }

  /** A section heading with a thin rule under it. */
  heading(value, { size = 13, color = COLORS.ink, space = 16 } = {}) {
    this.ensure(size + space + 30);
    this.y += space;
    this.text(value, { y: this.y + size, size, font: 'bold', color });
    this.y += size + 5;
    this.rule({ y: this.y, color: COLORS.rule });
    this.y += 8;
  }

  /** A row of boxed figures: [{ label, value }]. */
  statRow(cells, { perRow = 4, height = 46, gap = 8, accent = COLORS.ink } = {}) {
    const boxWidth = (this.contentWidth - gap * (perRow - 1)) / perRow;
    for (let i = 0; i < cells.length; i += perRow) {
      this.ensure(height + gap);
      cells.slice(i, i + perRow).forEach((cell, j) => {
        const x = this.left + j * (boxWidth + gap);
        this.rect({ x, y: this.y, w: boxWidth, h: height, fill: COLORS.wash });
        this.rect({ x, y: this.y, w: 2.5, h: height, fill: accent });
        this.text(fitLine(String(cell.value), { font: 'bold', size: 17, width: boxWidth - 16 }), { x: x + 10, y: this.y + 22, size: 17, font: 'bold' });
        this.text(fitLine(String(cell.label).toUpperCase(), { size: 7.5, width: boxWidth - 16 }), { x: x + 10, y: this.y + 36, size: 7.5, color: COLORS.muted });
      });
      this.y += height + gap;
    }
  }

  /** Horizontal bars: [{ label, value, note? }], the longest value filling the width. */
  barList(items, { labelWidth = 150, rowHeight = 17, color = COLORS.ink, size = 9 } = {}) {
    const max = Math.max(1, ...items.map((i) => i.value));
    const barArea = this.contentWidth - labelWidth - 60;
    for (const item of items) {
      this.ensure(rowHeight);
      this.text(fitLine(item.label, { size, width: labelWidth - 8 }), { y: this.y + 11, size });
      const w = Math.max(item.value > 0 ? 1.5 : 0, (item.value / max) * barArea);
      if (w > 0) this.rect({ x: this.left + labelWidth, y: this.y + 3, w, h: rowHeight - 7, fill: color });
      this.text(String(item.note ?? item.value), { x: this.left + labelWidth + w + 6, y: this.y + 11, size, color: COLORS.muted });
      this.y += rowHeight;
    }
  }

  /**
   * A table. columns: [{ label, width (a share of the width), align? }]. rows: arrays of cells, a cell being a string
   * or a list of lines, a line being a string or { text, font, color, size }. A row is never split across pages, and
   * the header row is drawn again at the top of each new page, never left alone at the foot of one. A cell too tall
   * for a page (a long note) is cut short with "..." rather than run off it.
   */
  table({ columns, rows, size = 8.5, padX = 5, padY = 4, header = COLORS.ink, headerText = COLORS.white, zebra = true, empty = '' }) {
    const total = columns.reduce((sum, c) => sum + c.width, 0);
    const widths = columns.map((c) => (c.width / total) * this.contentWidth);
    const headerHeight = 17;
    // What a page can hold under the header, less room for a running header and the footer.
    const tallest = this.bottom - this.margin - 40 - headerHeight - padY * 2;

    /** A row as the lines each cell will print, each cell cut to `tallest`, and the height of the row. */
    const measure = (row) => {
      const cells = row.map((cell, i) => {
        const list = Array.isArray(cell) ? cell : [cell];
        const lines = [];
        let height = 0;
        outer: for (const item of list) {
          const spec = typeof item === 'string' ? { text: item } : item;
          const lineSize = spec.size ?? size;
          const font = spec.font ?? 'regular';
          for (const line of wrapText(spec.text, { font, size: lineSize, width: widths[i] - padX * 2 })) {
            if (height + lineSize * 1.32 > tallest) {
              const last = lines[lines.length - 1];
              if (last) last.text = fitLine(`${last.text} ...`, { font: last.font, size: last.size, width: widths[i] - padX * 2 });
              break outer;
            }
            lines.push({ text: line, font, color: spec.color ?? COLORS.ink, size: lineSize });
            height += lineSize * 1.32;
          }
        }
        return { lines, height };
      });
      return { cells: cells.map((c) => c.lines), height: Math.max(...cells.map((c) => c.height)) + padY * 2 };
    };

    const drawHeader = (firstRowHeight) => {
      this.ensure(headerHeight + firstRowHeight);
      this.rect({ x: this.left, y: this.y, w: this.contentWidth, h: headerHeight, fill: header });
      let x = this.left;
      columns.forEach((column, i) => {
        this.text(fitLine(column.label, { font: 'bold', size: 7.5, width: widths[i] - padX * 2 }), {
          x: x + padX, width: widths[i] - padX * 2, y: this.y + 11.5, size: 7.5, font: 'bold', color: headerText, align: column.align ?? 'left',
        });
        x += widths[i];
      });
      this.y += headerHeight;
    };

    if (!rows.length) {
      this.paragraph(empty || 'Nothing to show.', { color: COLORS.muted, gap: 4 });
      return;
    }
    const measured = rows.map(measure);
    drawHeader(measured[0].height);
    measured.forEach(({ cells, height }, index) => {
      if (this.y + height > this.bottom) {
        this.addPage();
        drawHeader(0);
      }
      if (zebra && index % 2 === 1) this.rect({ x: this.left, y: this.y, w: this.contentWidth, h: height, fill: COLORS.wash });
      let x = this.left;
      cells.forEach((lines, i) => {
        let ly = this.y + padY;
        for (const line of lines) {
          this.text(line.text, {
            x: x + padX, width: widths[i] - padX * 2, y: ly + line.size * 0.95, size: line.size, font: line.font, color: line.color, align: columns[i].align ?? 'left',
          });
          ly += line.size * 1.32;
        }
        x += widths[i];
      });
      this.rule({ y: this.y + height, color: COLORS.rule, weight: 0.4 });
      this.y += height;
    });
    this.y += 4;
  }

  // ── output ─────────────────────────────────────────────────────────────

  /** The finished file. */
  finish() {
    const count = this.pages.length;
    if (this.footer) {
      for (let i = 0; i < count; i += 1) {
        this.current = this.pages[i];
        this.footer(this, i + 1, count);
      }
    }

    const objects = []; // 1-based object bodies as Buffers
    const add = (body) => {
      objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
      return objects.length;
    };
    const catalog = add('<< /Type /Catalog /Pages 2 0 R /Lang (en-US) >>');
    const pagesRef = add('PLACEHOLDER');
    const fontRefs = Object.keys(FONT_NAMES).map((key) => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONTS[key]} /Encoding /WinAnsiEncoding >>`));
    const info = add(
      `<< /Title ${infoString(this.info.title)} /Subject ${infoString(this.info.subject)} /Author ${infoString(this.info.author)} `
      + `/Creator ${infoString(this.info.creator)} /Producer ${infoString('Touradoor')} /CreationDate (${pdfDate(this.created)}) >>`,
    );
    const resources = `<< /Font << ${Object.keys(FONT_NAMES).map((key, i) => `/${FONT_NAMES[key]} ${fontRefs[i]} 0 R`).join(' ')} >> >>`;
    const pageRefs = [];
    for (const page of this.pages) {
      const stream = deflateSync(Buffer.from(page.ops.join('\n'), 'latin1'));
      const content = add(Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
        stream,
        Buffer.from('\nendstream', 'latin1'),
      ]));
      pageRefs.push(add(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] /Resources ${resources} /Contents ${content} 0 R >>`));
    }
    objects[pagesRef - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(' ')}] /Count ${count} >>`, 'latin1');

    const parts = [Buffer.from('%PDF-1.4\n%âãÏÓ\n', 'latin1')];
    const offsets = [];
    let position = parts[0].length;
    objects.forEach((body, i) => {
      offsets.push(position);
      const piece = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
      parts.push(piece);
      position += piece.length;
    });
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`];
    for (const offset of offsets) xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${position}\n%%EOF\n`);
    parts.push(Buffer.from(xref.join(''), 'latin1'));
    return Buffer.concat(parts);
  }
}
