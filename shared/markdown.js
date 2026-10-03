/**
 * A small, dependency-free Markdown parser for the buyer guides.
 *
 * It exists instead of a library for two reasons. First, the guides are written
 * by the builder in Setup and read by buyers on their phones, so the one thing
 * this must never do is turn text into script: there is no HTML pass at all,
 * raw tags are just characters, and every URL goes through `safeUrl`. Second,
 * the server (summaries, meta descriptions, structured data) and the client
 * (the article renderer, the live preview in the Learn tab) must read a guide
 * the same way, so the parser lives in `shared/` and returns a plain AST that
 * both sides walk. Nothing here touches the DOM, `window` or `Buffer`.
 *
 * Supported, because it is everything the supplied guides use plus a little
 * margin: `#`..`###` headings (deeper levels clamp to 3), paragraphs, `**strong**`,
 * `*em*` (and `***both***`), `` `code` ``, `[text](url)`, `![alt](src)` on a line
 * of its own, ordered and unordered lists (every item may be written `1.`),
 * `> **Title** — text` callouts, `---` rules and hard line breaks.
 * Not supported on purpose: raw HTML, entities (`&amp;` stays literal), tables,
 * fenced code, setext headings, autolinks, nested lists (they flatten).
 *
 * ── AST ──────────────────────────────────────────────────────────────────
 * Inline nodes: text{value} strong{children} em{children} link{href,children}
 *               code{value} br
 * Blocks:       heading{level,inline} paragraph{inline}
 *               list{ordered,start?,items: Inline[][]}
 *               callout{title,inline,more?: Block[]}
 *               image{alt,src} hr
 *
 * Every scan is bounded or memoised so an unclosed marker costs linear time
 * (see the fuzz test): a guide is edited live and must never hang the tab.
 */

const MAX_DEPTH = 6;
const MAX_LINK_TEXT = 1000;
const MAX_DEST = 2048;
const MAX_QUOTE_DEPTH = 3;
const MAX_URL = 2048;
const MAX_SUMMARY = 400;

// What a backslash may escape, as in CommonMark: any ASCII punctuation.
const ESCAPABLE = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

// Anything that has no business inside a URL we are about to put in an href:
// whitespace, C0/C1 controls, zero-width and bidi characters, soft hyphen,
// line separators, backslash (browsers read it as a slash), quotes and angle
// brackets. Browsers strip some of these inside a scheme ("java\tscript:"),
// which is exactly how filters get bypassed, so we refuse them outright.
// eslint-disable-next-line no-control-regex
const URL_FORBIDDEN = /[\s\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\\"'<>`]/u;

/**
 * The only URLs a guide may link to or load: https, http, mailto, tel, a
 * site-relative `/path` (not protocol-relative `//host`) and a `#anchor`.
 * Returns the URL unchanged when it is acceptable, otherwise null.
 *
 * It is an allow-list on the literal text, never a block-list of schemes and
 * never "decode, then check": an entity-encoded or percent-encoded scheme does
 * not start with one of the accepted prefixes, so it fails without us having to
 * guess how a browser would decode it.
 */
export function safeUrl(url, { allowRelative = true } = {}) {
  if (typeof url !== 'string') return null;
  if (url.length === 0 || url.length > MAX_URL) return null;
  if (URL_FORBIDDEN.test(url)) return null;
  if (/^https?:\/\/[^/?#]/i.test(url)) return url;
  if (/^(?:mailto|tel):[^:]/i.test(url)) return url;
  if (allowRelative) {
    if (url.startsWith('/') && url[1] !== '/') return url;
    if (url.startsWith('#')) return url;
  }
  return null;
}

// A destination with no scheme and no leading slash (`images/x.webp`,
// `closing-costs.md`). It is never put in an href as written: it is handed to
// the caller's resolver, or dropped. No colon is allowed, so it cannot hide a scheme.
function isBareRelative(url) {
  // A leading slash is excluded: `/path` is already a site path (safeUrl), and `//host/x`
  // is protocol-relative, a different origin that must never pass as "relative".
  return url.length > 0 && url.length <= MAX_URL && /^[A-Za-z0-9._~%+\-#?=][A-Za-z0-9._~%+\-/#?=]*$/.test(url);
}

/** Resolve a destination to a URL we will emit, or null (render as plain text). */
function resolveDestination(dest, resolver) {
  const safe = safeUrl(dest);
  if (safe) return safe;
  if (typeof resolver === 'function' && isBareRelative(dest)) {
    let resolved = null;
    try {
      resolved = resolver(dest);
    } catch {
      resolved = null;
    }
    // A resolver is caller code. Its answer gets the same scrutiny as authored text.
    return typeof resolved === 'string' ? safeUrl(resolved) : null;
  }
  return null;
}

// ── inline ────────────────────────────────────────────────────────────────

function isWs(ch) {
  return ch === ' ' || ch === '\n' || ch === '\t';
}

// Where every `[` in `s` closes, found in one pass with a stack. Asking
// readBracketed to rescan from each `[` costs up to MAX_LINK_TEXT steps apiece,
// so a body of unclosed brackets was ~1000 x its length. The pairing is the same
// one a scan from that `[` would find: a backslash hides the next character and
// a `]` with nothing open is ignored.
function matchBrackets(s) {
  const close = new Int32Array(s.length).fill(-1);
  const open = [];
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') j++;
    else if (c === '[') open.push(j);
    else if (c === ']' && open.length) close[open.pop()] = j;
  }
  return close;
}

/**
 * Read `[label](dest "title")` starting at `s[i] === '['`.
 * Returns { label, dest, end } (end = index just past the closing paren) or null.
 * Scans are capped so `[[[[[[` or a never-closed `(` cannot go quadratic.
 * `memo` (optional, one per string) caches the bracket pairing across calls on
 * the same string; a one-off call may leave it out.
 */
function readBracketed(s, i, memo) {
  let closeB = -1;
  if (memo) {
    if (!memo.close) memo.close = matchBrackets(s);
    closeB = memo.close[i];
    // The label may be at most MAX_LINK_TEXT characters, as in the plain scan.
    if (closeB >= i + MAX_LINK_TEXT) closeB = -1;
  } else {
    let depth = 0;
    const limit = Math.min(s.length, i + MAX_LINK_TEXT);
    for (let j = i; j < limit; j++) {
      const c = s[j];
      if (c === '\\') {
        j++;
      } else if (c === '[') {
        depth++;
      } else if (c === ']') {
        depth--;
        if (depth === 0) {
          closeB = j;
          break;
        }
      }
    }
  }
  if (closeB < 0 || s[closeB + 1] !== '(') return null;

  let k = closeB + 2;
  const destLimit = Math.min(s.length, k + MAX_DEST + 256);
  while (k < destLimit && isWs(s[k])) k++;
  let dest = '';
  if (s[k] === '<') {
    const gt = s.indexOf('>', k + 1);
    if (gt < 0 || gt > destLimit) return null;
    dest = s.slice(k + 1, gt);
    k = gt + 1;
  } else {
    const start = k;
    let parens = 0;
    for (; k < destLimit; k++) {
      const c = s[k];
      if (isWs(c)) break;
      if (c === '(') parens++;
      else if (c === ')') {
        if (parens === 0) break;
        parens--;
      }
    }
    dest = s.slice(start, k);
  }
  while (k < destLimit && isWs(s[k])) k++;
  // An optional title ("..." or '...'); we ignore it but must step over it.
  if (s[k] === '"' || s[k] === "'") {
    const q = s[k];
    const close = s.indexOf(q, k + 1);
    if (close < 0 || close > destLimit) return null;
    k = close + 1;
    while (k < destLimit && isWs(s[k])) k++;
  }
  if (s[k] !== ')') return null;
  return { label: s.slice(i + 1, closeB), dest, end: k + 1 };
}

// Find the end of a code span opened with a run of `n` backticks at `from`.
function findTickClose(s, from, n, failed) {
  if (failed[n] !== undefined && from >= failed[n]) return -1;
  let j = from;
  while (j < s.length) {
    j = s.indexOf('`', j);
    if (j < 0) break;
    let m = 1;
    while (s[j + m] === '`') m++;
    if (m === n) return j;
    j += m;
  }
  failed[n] = from;
  return -1;
}

// Find the closing run for an emphasis opener of `n` (1..3) stars whose content
// starts at `from`. Runs of other lengths belong to nested emphasis and are
// skipped; a longer run closes with its trailing stars so `**a *b***` nests right.
function findStarClose(s, from, n, failed) {
  if (failed[n] !== undefined && from >= failed[n]) return -1;
  let j = from;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c !== '*') {
      j++;
      continue;
    }
    let m = 1;
    while (s[j + m] === '*') m++;
    const closes = j > from && !isWs(s[j - 1]);
    if (closes) {
      if (n === 1 && m === 1) return j;
      if (n === 1 && m >= 3) return j + m - 1;
      if (n === 2 && m >= 2) return j + m - 2;
      if (n === 3 && m >= 3) return j + m - 3;
    }
    j += m;
  }
  failed[n] = from;
  return -1;
}

function mergeText(nodes) {
  const out = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (node.type === 'text' && last && last.type === 'text') last.value += node.value;
    else out.push(node);
  }
  return out;
}

/**
 * Parse inline Markdown. `ctx` = { depth, inLink, resolveLink }.
 * Unknown or unclosed markers fall through as literal text; nothing throws.
 */
function parseInline(s, ctx) {
  const out = [];
  let buf = '';
  // Spaces seen since the last real character are held back instead of being
  // appended. A line break needs to know how many trailing spaces precede it
  // (two make a hard break), and reading or slicing the end of a string that is
  // built one piece at a time flattens it each time, which made a paragraph of
  // many short lines quadratic.
  let pending = 0;
  const add = (str) => {
    if (pending) {
      buf += ' '.repeat(pending);
      pending = 0;
    }
    buf += str;
  };
  // Text that may itself end in spaces (an image's alt words): keep those spaces pending.
  const addText = (str) => {
    let end = str.length;
    while (end > 0 && str[end - 1] === ' ') end--;
    // An all-space (or empty) text must not flush the spaces already pending.
    if (end > 0) add(str.slice(0, end));
    pending += str.length - end;
  };
  const flush = () => {
    if (pending) {
      buf += ' '.repeat(pending);
      pending = 0;
    }
    if (buf) {
      out.push({ type: 'text', value: buf });
      buf = '';
    }
  };
  const failedStars = {};
  const failedTicks = {};
  const bracketMemo = {};
  const live = ctx.depth < MAX_DEPTH;
  const inner = { ...ctx, depth: ctx.depth + 1 };

  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (ch === '\\') {
      const next = s[i + 1];
      if (next === '\n') {
        flush();
        out.push({ type: 'br' });
        i += 2;
        continue;
      }
      if (next !== undefined && ESCAPABLE.includes(next)) {
        add(next);
        i += 2;
        continue;
      }
      add(ch);
      i++;
      continue;
    }

    if (ch === '\n') {
      const hard = pending >= 2;
      // Trailing spaces before a break are dropped; a soft break is one space.
      pending = 0;
      if (hard) {
        flush();
        out.push({ type: 'br' });
      } else {
        pending = 1;
      }
      i++;
      continue;
    }

    if (ch === '`' && live) {
      let n = 1;
      while (s[i + n] === '`') n++;
      const close = findTickClose(s, i + n, n, failedTicks);
      if (close >= 0) {
        let code = s.slice(i + n, close).replace(/\n/g, ' ');
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1);
        flush();
        out.push({ type: 'code', value: code });
        i = close + n;
        continue;
      }
      add('`'.repeat(n));
      i += n;
      continue;
    }

    if (ch === '*' && live) {
      let n = 1;
      while (s[i + n] === '*') n++;
      const after = s[i + n];
      if (n <= 3 && after !== undefined && !isWs(after)) {
        const close = findStarClose(s, i + n, n, failedStars);
        if (close >= 0) {
          const children = parseInline(s.slice(i + n, close), inner);
          let node;
          if (n === 1) node = { type: 'em', children };
          else if (n === 2) node = { type: 'strong', children };
          else node = { type: 'em', children: [{ type: 'strong', children }] };
          flush();
          out.push(node);
          i = close + n;
          continue;
        }
      }
      add('*'.repeat(n));
      i += n;
      continue;
    }

    if ((ch === '[' || (ch === '!' && s[i + 1] === '[')) && live) {
      const isImage = ch === '!';
      const start = isImage ? i + 1 : i;
      const parsed = readBracketed(s, start, bracketMemo);
      if (parsed) {
        if (isImage) {
          // Images are blocks (a line of their own). Mid-sentence one degrades to
          // its alt text, so the words survive and nothing is fetched.
          const alt = nodesToText(parseInline(parsed.label, inner));
          addText(alt);
        } else if (ctx.inLink) {
          // Links never nest; the inner one is just its words.
          addText(nodesToText(parseInline(parsed.label, inner)));
        } else {
          const children = parseInline(parsed.label, { ...inner, inLink: true });
          const href = resolveDestination(parsed.dest, ctx.resolveLink);
          if (href) {
            flush();
            out.push({ type: 'link', href, children });
          } else {
            // Refused URL: keep the words, lose the link.
            flush();
            out.push(...children);
          }
        }
        i = parsed.end;
        continue;
      }
      add(isImage ? '![' : '[');
      i += isImage ? 2 : 1;
      continue;
    }

    if (ch === ' ') pending++;
    else add(ch);
    i++;
  }
  flush();
  return mergeText(out);
}

function nodesToText(nodes) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'code') out += node.value;
    else if (node.type === 'br') out += '\n';
    else if (node.children) out += nodesToText(node.children);
  }
  return out;
}

// ── blocks ────────────────────────────────────────────────────────────────

const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+|$)/;
const HR = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const BULLET = /^ {0,3}[-*+](?: +|$)/;
const ORDERED = /^ {0,3}(\d{1,9})[.)](?: +|$)/;

function isBlank(line) {
  return line.trim() === '';
}

function isImageLine(line) {
  const t = line.trim();
  if (!t.startsWith('![')) return false;
  const parsed = readBracketed(t, 1);
  return !!parsed && parsed.end === t.length;
}

// A line that ends the paragraph above it. An ordered marker only interrupts
// when it is "1", so a wrapped line that happens to start "2024. " stays prose.
function startsBlock(line) {
  if (HEADING.test(line) || HR.test(line) || BULLET.test(line)) return true;
  if (/^ {0,3}>/.test(line)) return true;
  const ordered = ORDERED.exec(line);
  if (ordered && ordered[1] === '1') return true;
  return isImageLine(line);
}

// Drop trailing spaces by walking back from the end. `.replace(/ +$/, '')` looks
// harmless but retries from every space in a long interior run, so a 60,000
// character body of spaces (or tabs, which parseMarkdown expands to four each)
// took seconds. Guide pages are public and previewed live, so it must be linear.
function trimEndSpaces(text) {
  let end = text.length;
  while (end > 0 && text[end - 1] === ' ') end--;
  return end === text.length ? text : text.slice(0, end);
}

function stripHeadingClose(text) {
  // "## Title ##": the closing hashes are decoration. Done by hand, not with a
  // regex, because `\s+#+\s*$` backtracks quadratically on a long run of spaces.
  let end = text.length;
  while (end > 0 && text[end - 1] === ' ') end--;
  let k = end;
  while (k > 0 && text[k - 1] === '#') k--;
  if (k < end && k > 0 && text[k - 1] === ' ') {
    end = k;
    while (end > 0 && text[end - 1] === ' ') end--;
    return text.slice(0, end);
  }
  return text.slice(0, end);
}

// `**Title** — text` -> { title, rest }. By hand for the same reason as above.
function splitCalloutTitle(text) {
  if (!text.startsWith('**')) return null;
  const close = text.indexOf('**', 2);
  if (close < 3) return null;
  const rawTitle = text.slice(2, close);
  if (isWs(rawTitle[0]) || isWs(rawTitle[rawTitle.length - 1])) return null;
  let k = close + 2;
  while (k < text.length && isWs(text[k])) k++;
  const c = text[k];
  if (c === '\u2014' || c === '\u2013' || c === '-' || c === ':') {
    k++;
    while (text[k] === '-') k++;
    while (k < text.length && isWs(text[k])) k++;
  }
  return { rawTitle, rest: text.slice(k) };
}

function parseBlocks(lines, ctx, quoteDepth) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const text = stripHeadingClose(line.slice(heading[0].length).trim());
      blocks.push({ type: 'heading', level: Math.min(heading[1].length, 3), inline: parseInline(text, ctx) });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (isImageLine(line)) {
      const parsed = readBracketed(line.trim(), 1);
      const alt = nodesToText(parseInline(parsed.label, { ...ctx, depth: ctx.depth + 1 })).trim();
      const src = resolveDestination(parsed.dest, ctx.resolveImage);
      if (src) {
        blocks.push({ type: 'image', alt, src });
      } else if (alt && !isBareRelative(parsed.dest)) {
        // A refused address: the picture is not shown, its words are.
        blocks.push({ type: 'paragraph', inline: [{ type: 'text', value: alt }] });
      }
      i++;
      continue;
    }

    if (/^ {0,3}>/.test(line) && quoteDepth < MAX_QUOTE_DEPTH) {
      const quoted = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i++;
      }
      blocks.push(parseCallout(quoted, ctx, quoteDepth));
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      const isOrdered = !!ordered && !bullet;
      const marker = isOrdered ? ORDERED : BULLET;
      const start = isOrdered ? Number(ordered[1]) : 1;
      const items = [];
      let current = null;
      while (i < lines.length) {
        const l = lines[i];
        const m = marker.exec(l);
        if (m) {
          if (current) items.push(current);
          current = [l.slice(m[0].length).trim()];
          i++;
          continue;
        }
        if (isBlank(l)) {
          // A blank line keeps the list going only if another item follows.
          let n = i + 1;
          while (n < lines.length && isBlank(lines[n])) n++;
          if (n < lines.length && marker.test(lines[n])) {
            i = n;
            continue;
          }
          break;
        }
        // The other kind of list, a heading, a rule or a quote ends this list.
        if (startsBlock(l) || ORDERED.test(l) || BULLET.test(l)) break;
        // Otherwise a wrapped continuation of the current item.
        if (current) current.push(l.trim());
        i++;
      }
      if (current) items.push(current);
      const node = {
        type: 'list',
        ordered: isOrdered,
        items: items.map((item) => parseInline(item.join('\n'), ctx)),
      };
      if (isOrdered && start !== 1) node.start = start;
      blocks.push(node);
      continue;
    }

    const para = [];
    while (i < lines.length && !isBlank(lines[i])) {
      if (para.length > 0 && startsBlock(lines[i])) break;
      para.push(lines[i].replace(/^ +/, ''));
      i++;
    }
    // The first line may itself be a quote at max depth; treat it as text.
    blocks.push({ type: 'paragraph', inline: parseInline(trimEndSpaces(para.join('\n')), ctx) });
  }
  return blocks;
}

function parseCallout(quoted, ctx, quoteDepth) {
  let first = 0;
  while (first < quoted.length && isBlank(quoted[first])) first++;
  let end = first;
  while (end < quoted.length && !isBlank(quoted[end])) end++;
  const head = quoted.slice(first, end).map((l) => l.trim()).join('\n');
  const split = splitCalloutTitle(head);
  const node = {
    type: 'callout',
    title: split ? nodesToText(parseInline(split.rawTitle, { ...ctx, depth: ctx.depth + 1 })).trim() : '',
    inline: parseInline(split ? split.rest : head, ctx),
  };
  const rest = parseBlocks(quoted.slice(end), ctx, quoteDepth + 1);
  if (rest.length) node.more = rest;
  return node;
}

/**
 * Markdown source -> blocks. Never throws; unknown syntax stays text.
 * `options.resolveImage(src)` / `options.resolveLink(href)` turn a scheme-less
 * relative address (`images/x.webp`, `other-guide.md`) into a URL; without them
 * such images are dropped and such links keep only their words.
 */
export function parseMarkdown(src, options = {}) {
  const text = String(src ?? '')
    .replace(/^\ufeff/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\t/g, '    ');
  const ctx = {
    depth: 0,
    inLink: false,
    resolveImage: options.resolveImage,
    resolveLink: options.resolveLink,
  };
  return parseBlocks(text.split('\n'), ctx, 0);
}

// ── plain text ────────────────────────────────────────────────────────────

function blockToText(block) {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
      return nodesToText(block.inline);
    case 'list':
      return block.items.map((item) => nodesToText(item)).join('\n');
    case 'callout': {
      const body = [nodesToText(block.inline)];
      if (block.more) body.push(...block.more.map(blockToText));
      const text = body.filter(Boolean).join('\n');
      return block.title ? `${block.title} ${text}`.trim() : text;
    }
    default:
      return '';
  }
}

/** Markdown source -> prose with every marker removed, one block per line. */
export function markdownToText(src) {
  return parseMarkdown(src)
    .map(blockToText)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:\u2014-]+$/, '') + '\u2026';
}

function humanize(filename) {
  const base = String(filename || '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.md$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}

/**
 * Split a supplied guide into its fields. The supplied files share one shape:
 *
 *   # Title
 *   *Category*
 *   By Name, NMLS # ... · Company, NMLS # ...
 *   *Educational information, not financial or legal advice*
 *   ![alt](images/hero.webp)
 *   first paragraph ... (the summary)
 *   ...body...
 *
 * Everything above the picture (and the picture) is lifted out into fields, so
 * `body` is the article alone and the page can lay the header out itself.
 * `filename` is only a fallback for a missing title. `options.resolveImage` maps
 * a bare relative hero (`images/hero.webp`) to a real URL, as in `parseMarkdown`.
 */
export function parseGuideMarkdown(src, filename = '', options = {}) {
  const lines = String(src ?? '')
    .replace(/^\ufeff/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  // The hero picture is part of the header only if it comes before the first
  // section heading; a picture further down belongs to the article and stays.
  const firstSection = lines.findIndex((l) => /^ {0,3}#{2,6}[ \t]/.test(l));
  const imageAt = lines.findIndex((l, n) => (firstSection < 0 || n < firstSection) && isImageLine(l));
  let headEnd = imageAt;
  if (headEnd < 0) {
    // No picture: the header is the run of title / italic / byline lines at the top.
    headEnd = 0;
    while (headEnd < lines.length) {
      const t = lines[headEnd].trim();
      if (t === '' || /^# /.test(t) || /^By /.test(t) || /^\*[^*].*\*$/.test(t)) headEnd++;
      else break;
    }
  }

  let title = '';
  let byline = '';
  const italics = [];
  for (let i = 0; i < headEnd; i++) {
    const t = lines[i].trim();
    if (!title && /^# /.test(t)) title = markdownToText(t.slice(2));
    else if (!byline && /^By /.test(t)) byline = markdownToText(t);
    else if (/^\*[^*](?:.*[^*])?\*$/.test(t)) italics.push(markdownToText(t));
  }

  let imageAlt = '';
  let imageSrc = '';
  if (imageAt >= 0) {
    const t = lines[imageAt].trim();
    const parsed = readBracketed(t, 1);
    imageAlt = nodesToText(parseInline(parsed.label, { depth: 1, inLink: false })).trim();
    // The same allow-list as every other URL here. A bare relative name
    // (`images/hero.webp`) is inert, so with no resolver it is returned for the
    // caller to map to a real file; with one, only the resolver's checked answer
    // counts. Anything with a scheme we refuse comes back empty.
    const resolved = resolveDestination(parsed.dest, options.resolveImage);
    if (resolved) imageSrc = resolved;
    else if (typeof options.resolveImage !== 'function' && isBareRelative(parsed.dest)) imageSrc = parsed.dest;
  }

  const bodySource = lines.slice(headEnd + (imageAt >= 0 ? 1 : 0)).join('\n').trim();
  const firstPara = parseMarkdown(bodySource).find((b) => b.type === 'paragraph');
  const summary = firstPara
    ? clip(nodesToText(firstPara.inline).replace(/\s+/g, ' ').trim(), MAX_SUMMARY)
    : '';

  return {
    title: title || humanize(filename),
    category: italics[0] || '',
    byline,
    note: italics[1] || '',
    imageAlt,
    imageSrc,
    summary,
    body: bodySource,
  };
}
