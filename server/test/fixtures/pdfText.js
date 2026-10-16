import { inflateSync } from 'node:zlib';

/**
 * What the PDF writer put on each page, read straight from the file: the content stream of every page inflated, and
 * the strings shown by each text operator decoded from hex. A test uses this so it does not depend on poppler.
 * Returns [{ ops, lines }] in page order, `lines` being the text of each text operator as Windows-1252 characters.
 */
export function readPdf(buffer) {
  const raw = buffer.toString('latin1');
  const streams = [];
  const head = /<< \/Length (\d+) \/Filter \/FlateDecode >>\nstream\n/g;
  let match;
  while ((match = head.exec(raw))) {
    const start = match.index + match[0].length;
    const body = buffer.subarray(start, start + Number(match[1]));
    streams.push(inflateSync(body).toString('latin1'));
  }
  return streams.map((ops) => ({
    ops,
    lines: [...ops.matchAll(/<([0-9A-Fa-f]*)> Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')),
  }));
}

/** All the text of a PDF, one string, in the order it was drawn. */
export const pdfText = (buffer) => readPdf(buffer).flatMap((page) => page.lines).join('\n');
