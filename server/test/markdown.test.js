import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { markdownToText, parseGuideMarkdown, parseMarkdown, safeUrl } from '../../shared/markdown.js';
import { DEFAULT_GUIDE_ORDER, loadDefaultGuides, orderGuideSlugs, readGuidesFrom } from '../lib/guides.js';

const here = dirname(fileURLToPath(import.meta.url));
const GUIDE_DIR = join(here, '..', 'content', 'guides');
const guideFiles = readdirSync(GUIDE_DIR)
  .filter((name) => name.endsWith('.md'))
  .sort();

// The buyer-journey order from the spec, written out here on purpose: comparing the
// loader with its own exported list would pass whatever the list said.
const SPEC_ORDER = [
  'how-much-house-can-you-afford-northern-utah',
  'credit-score-buy-house-utah',
  'utah-first-time-buyer-new-construction-programs',
  'first-time-buyer-programs-weber-davis-county',
  'monthly-cost-new-townhome-northern-utah',
  'closing-costs-utah-homebuyer',
  'temporary-rate-buydown-utah',
  'rent-vs-buy-ogden-clearfield',
  'townhome-vs-house-utah',
  'townhome-hoa-fees-utah',
  'buying-house-with-student-loans-utah',
  'buying-near-hill-air-force-base-utah',
  '16-questions-to-ask-before-buying-a-new-construction-townhome-in-utah',
];

// ── helpers ───────────────────────────────────────────────────────────────

/** Every inline node under a list of inline nodes, depth first. */
function walkInline(nodes, visit) {
  for (const node of nodes) {
    visit(node);
    if (node.children) walkInline(node.children, visit);
  }
}

/** Every inline run in a block list, including callout bodies. */
function walkBlocks(blocks, visit) {
  for (const block of blocks) {
    if (block.inline) walkInline(block.inline, visit);
    if (block.items) for (const item of block.items) walkInline(item, visit);
    if (block.more) walkBlocks(block.more, visit);
  }
}

function allBlocks(blocks) {
  const out = [];
  for (const block of blocks) {
    out.push(block);
    if (block.more) out.push(...allBlocks(block.more));
  }
  return out;
}

function links(blocks) {
  const found = [];
  walkBlocks(blocks, (node) => node.type === 'link' && found.push(node));
  return found;
}

function textOf(nodes) {
  let out = '';
  walkInline(nodes, (node) => {
    if (node.type === 'text' || node.type === 'code') out += node.value;
  });
  return out;
}

function firstParagraph(src, options) {
  return parseMarkdown(src, options).find((b) => b.type === 'paragraph');
}

// ── the 13 supplied guides ────────────────────────────────────────────────

test('there are 13 supplied guides to check', () => {
  assert.equal(guideFiles.length, 13);
});

for (const file of guideFiles) {
  test(`guide ${file} parses into every field`, () => {
    const src = readFileSync(join(GUIDE_DIR, file), 'utf8');
    const g = parseGuideMarkdown(src, file);

    for (const field of ['title', 'category', 'byline', 'note', 'summary', 'imageAlt']) {
      assert.ok(g[field] && g[field].trim().length > 0, `${field} is empty`);
    }
    assert.ok(g.byline.startsWith('By '), 'byline is the By line');
    assert.ok(/not financial or legal advice/i.test(g.note), 'note is the disclaimer line');
    assert.equal(g.imageSrc, 'images/blog-hero-model-home.webp');

    assert.ok(g.summary.length <= 400, `summary is ${g.summary.length} chars`);
    assert.doesNotMatch(g.summary, /[*[\]`#]|!\[|\]\(/, 'summary must be plain text');

    // The page lays the header out itself, so none of it may be left in the body.
    assert.ok(!g.body.includes(`# ${g.title}`), 'title line is still in the body');
    assert.ok(!g.body.includes('![') && !g.body.includes('blog-hero-model-home'), 'hero image line is still in the body');
    assert.ok(!g.body.includes(g.byline), 'byline is still in the body');
    assert.ok(g.body.startsWith(g.summary.slice(0, 40)), 'the body opens with the lede paragraph');
    // The supplied ledes are short, so the summary is the whole first paragraph, not a clipped one.
    assert.equal(g.summary, markdownToText(g.body.split('\n\n')[0]));
    // Never edit the guides' own closing material: the dated figures line survives verbatim.
    assert.match(g.body, /\*Figures shown are current as of 8\/27\/26\./);
  });

  test(`guide ${file} keeps its lists, callouts and headings`, () => {
    const src = readFileSync(join(GUIDE_DIR, file), 'utf8');
    const { body } = parseGuideMarkdown(src, file);
    const blocks = parseMarkdown(body);

    // Every "1." line in the source is an item of an ordered list.
    const sourceOrdered = body.split('\n').filter((l) => /^\d+\.\s/.test(l)).length;
    const parsedOrdered = blocks.filter((b) => b.type === 'list' && b.ordered).reduce((n, b) => n + b.items.length, 0);
    assert.equal(parsedOrdered, sourceOrdered);

    const sourceBullets = body.split('\n').filter((l) => /^- /.test(l)).length;
    const parsedBullets = blocks.filter((b) => b.type === 'list' && !b.ordered).reduce((n, b) => n + b.items.length, 0);
    assert.equal(parsedBullets, sourceBullets);

    // Each "> **Title** — text" line is one callout with that title.
    const quoteTitles = body
      .split('\n')
      .filter((l) => l.startsWith('> '))
      .map((l) => /^> \*\*(.+?)\*\*/.exec(l)[1]);
    const callouts = blocks.filter((b) => b.type === 'callout');
    assert.deepEqual(
      callouts.map((c) => c.title),
      quoteTitles,
    );
    for (const c of callouts) assert.ok(textOf(c.inline).length > 10, 'callout text is not empty');

    const h2 = body.split('\n').filter((l) => l.startsWith('## ')).length;
    assert.equal(blocks.filter((b) => b.type === 'heading' && b.level === 2).length, h2);
    assert.equal(blocks.filter((b) => b.type === 'hr').length, 1);
  });
}

test('the sixteen questions come out as four ordered lists of 5, 5, 3 and 3', () => {
  const file = guideFiles.find((f) => f.startsWith('16-questions'));
  const { body } = parseGuideMarkdown(readFileSync(join(GUIDE_DIR, file), 'utf8'), file);
  const lists = parseMarkdown(body).filter((b) => b.type === 'list');
  assert.deepEqual(
    lists.map((l) => [l.ordered, l.items.length]),
    [
      [true, 5],
      [true, 5],
      [true, 3],
      [true, 3],
    ],
  );
  assert.equal(lists.every((l) => l.start === undefined), true, 'every item is written 1. but the lists start at 1');
});

test('the Keep reading link lists keep their words even though the links are relative', () => {
  const { body } = parseGuideMarkdown(readFileSync(join(GUIDE_DIR, 'temporary-rate-buydown-utah.md'), 'utf8'));
  const list = parseMarkdown(body).find((b) => b.type === 'list' && !b.ordered);
  assert.equal(list.items.length, 3);
  assert.equal(textOf(list.items[0]), 'What a New Townhome Actually Costs Per Month in Northern Utah');
  assert.equal(links(parseMarkdown(body)).length, 0, 'a scheme-less link is not emitted without a resolver');

  const resolved = parseMarkdown(body, {
    resolveLink: (href) => (href.endsWith('.md') ? `/c/x/guides/${href.slice(0, -3)}` : null),
  });
  assert.deepEqual(
    links(resolved).map((l) => l.href),
    [
      '/c/x/guides/monthly-cost-new-townhome-northern-utah',
      '/c/x/guides/closing-costs-utah-homebuyer',
      '/c/x/guides/how-much-house-can-you-afford-northern-utah',
    ],
  );
});

// ── blocks and inline syntax ──────────────────────────────────────────────

test('headings: levels 1 to 3, deeper levels clamp, closing hashes and non-headings', () => {
  const blocks = parseMarkdown('# One\n## Two ##\n### Three\n#### Four\n###### Six\n#hashtag\n####### seven');
  assert.deepEqual(
    blocks.map((b) => [b.type, b.level, b.inline && textOf(b.inline)]),
    [
      ['heading', 1, 'One'],
      ['heading', 2, 'Two'],
      ['heading', 3, 'Three'],
      ['heading', 3, 'Four'],
      ['heading', 3, 'Six'],
      ['paragraph', undefined, '#hashtag ####### seven'],
    ],
  );
});

test('paragraphs split on blank lines and a soft wrap is a space, not a break', () => {
  const blocks = parseMarkdown('one\ntwo\n\nthree');
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].inline, [{ type: 'text', value: 'one two' }]);
});

test('hard breaks: two trailing spaces and a trailing backslash', () => {
  const spaces = firstParagraph('first  \nsecond').inline;
  assert.deepEqual(
    spaces.map((n) => n.type),
    ['text', 'br', 'text'],
  );
  assert.equal(spaces[0].value, 'first');
  const slash = firstParagraph('first\\\nsecond').inline;
  assert.deepEqual(
    slash.map((n) => n.type),
    ['text', 'br', 'text'],
  );
  assert.equal(firstParagraph('first \nsecond').inline.some((n) => n.type === 'br'), false, 'one space is not a break');
});

test('strong and em nest in every order, and *** is both', () => {
  const nested = firstParagraph('**bold *and em* bold** then *em **and bold** em* then ***both***').inline;
  assert.equal(nested[0].type, 'strong');
  assert.deepEqual(
    nested[0].children.map((n) => n.type),
    ['text', 'em', 'text'],
  );
  assert.equal(nested[2].type, 'em');
  assert.deepEqual(
    nested[2].children.map((n) => n.type),
    ['text', 'strong', 'text'],
  );
  assert.equal(nested[4].type, 'em');
  assert.equal(nested[4].children[0].type, 'strong');
  assert.equal(textOf(nested), 'bold and em bold then em and bold em then both');
});

test('a lone asterisk, spaced asterisks and escapes stay literal', () => {
  assert.equal(textOf(firstParagraph('2 * 3 * 4').inline), '2 * 3 * 4');
  assert.equal(textOf(firstParagraph('\\*not em\\* and \\[x\\]').inline), '*not em* and [x]');
  assert.equal(textOf(firstParagraph('5 stars **').inline), '5 stars **');
});

test('inline code is literal inside', () => {
  const inline = firstParagraph('use `**not bold**` here').inline;
  assert.deepEqual(inline.map((n) => n.type), ['text', 'code', 'text']);
  assert.equal(inline[1].value, '**not bold**');
});

test('ordered lists: every item written 1. is still one ordered list; a different start is kept', () => {
  const same = parseMarkdown('1. a\n1. b\n1. c')[0];
  assert.equal(same.type, 'list');
  assert.equal(same.ordered, true);
  assert.equal(same.items.length, 3);
  assert.equal(same.start, undefined);
  const from3 = parseMarkdown('3. a\n4. b')[0];
  assert.equal(from3.start, 3);
  assert.equal(parseMarkdown('1) a\n2) b')[0].items.length, 2);
});

test('lists: bullets, wrapped items, blank lines inside, and an unrelated list type starts a new list', () => {
  const blocks = parseMarkdown('- one\n  wraps here\n- two\n\n- three\n1. new\n1. list\n\nafter');
  assert.deepEqual(
    blocks.map((b) => [b.type, b.ordered, b.items?.length]),
    [
      ['list', false, 3],
      ['list', true, 2],
      ['paragraph', undefined, undefined],
    ],
  );
  assert.equal(textOf(blocks[0].items[0]), 'one wraps here');
});

test('a list can follow a paragraph without a blank line, and ends at a heading', () => {
  const blocks = parseMarkdown('Intro\n- a\n- b\n## Next');
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'list', 'heading']);
});

test('callouts: bold title, then the text; em dash, hyphen and colon separators', () => {
  for (const sep of [' — ', ' - ', ' – ', ': ', ' -- ']) {
    const [callout] = parseMarkdown(`> **Ask for documents, not answers**${sep}The CC&Rs, the *budget*.`);
    assert.equal(callout.type, 'callout', `separator ${JSON.stringify(sep)}`);
    assert.equal(callout.title, 'Ask for documents, not answers');
    assert.equal(textOf(callout.inline), 'The CC&Rs, the budget.');
    assert.equal(callout.inline[1].type, 'em');
  }
});

test('callouts: a quote without a bold title has an empty title, and extra paragraphs go in more', () => {
  const [plain] = parseMarkdown('> just a quote');
  assert.equal(plain.type, 'callout');
  assert.equal(plain.title, '');
  assert.equal(textOf(plain.inline), 'just a quote');

  const [multi] = parseMarkdown('> **T** — first\n>\n> second paragraph\n> - item');
  assert.equal(multi.title, 'T');
  assert.deepEqual(
    multi.more.map((b) => b.type),
    ['paragraph', 'list'],
  );
});

test('callout title text is plain even when it contains a dollar figure and punctuation', () => {
  const [c] = parseMarkdown('> **$172 a month is $2,064 a year** — Roughly what a policy costs.');
  assert.equal(c.title, '$172 a month is $2,064 a year');
});

test('horizontal rules in all three spellings, and a rule ends a paragraph', () => {
  assert.deepEqual(parseMarkdown('---\n***\n___\n- - -').map((b) => b.type), ['hr', 'hr', 'hr', 'hr']);
  assert.deepEqual(parseMarkdown('text\n---\nmore').map((b) => b.type), ['paragraph', 'hr', 'paragraph']);
});

test('block images: https is kept, scheme-less is dropped unless resolved, refused addresses show only their alt text', () => {
  assert.deepEqual(parseMarkdown('![A porch](https://cdn.example.com/p.webp)'), [
    { type: 'image', alt: 'A porch', src: 'https://cdn.example.com/p.webp' },
  ]);
  assert.deepEqual(parseMarkdown('![A porch](/guides/p.webp)')[0].src, '/guides/p.webp');
  assert.deepEqual(parseMarkdown('![Hero](images/hero.webp)'), []);
  assert.deepEqual(parseMarkdown('![Hero](images/hero.webp)', { resolveImage: (s) => `/guides/${s.split('/').pop()}` }), [
    { type: 'image', alt: 'Hero', src: '/guides/hero.webp' },
  ]);
  // A resolver is caller code: what it returns is checked like any other URL.
  assert.deepEqual(parseMarkdown('![Hero](images/hero.webp)', { resolveImage: () => 'javascript:alert(1)' }), []);
  const refused = parseMarkdown('![Click me](javascript:alert(1))');
  assert.deepEqual(refused.map((b) => b.type), ['paragraph']);
  assert.equal(textOf(refused[0].inline), 'Click me');
});

test('an image in the middle of a sentence becomes its alt text and fetches nothing', () => {
  const p = firstParagraph('see ![the plan](https://x.test/p.png) here');
  assert.equal(textOf(p.inline), 'see the plan here');
  assert.equal(parseMarkdown('see ![the plan](https://x.test/p.png) here').some((b) => b.type === 'image'), false);
});

test('good links come through; titles are ignored; balanced parentheses stay in the URL', () => {
  const blocks = parseMarkdown(
    '[a](https://example.com "A title") [b](http://example.com/x_(y)) [c](mailto:a@b.co) [d](tel:+18015550100) [e](/c/x/guides) [f](#top)',
  );
  assert.deepEqual(
    links(blocks).map((l) => l.href),
    ['https://example.com', 'http://example.com/x_(y)', 'mailto:a@b.co', 'tel:+18015550100', '/c/x/guides', '#top'],
  );
});

test('links do not nest, and link text can carry emphasis', () => {
  const found = links(parseMarkdown('[**bold** [inner](https://a.test)](https://b.test)'));
  assert.equal(found.length, 1);
  assert.equal(found[0].href, 'https://b.test');
  assert.equal(found[0].children[0].type, 'strong');
  assert.equal(textOf(found[0].children), 'bold inner');
});

test('a scheme-less link goes to resolveLink, and only what it returns safely is used', () => {
  const resolve = (h) => (h === 'a.md' ? '/c/x/guides/a' : h === 'bad.md' ? 'javascript:alert(1)' : null);
  assert.equal(links(parseMarkdown('[x](a.md)', { resolveLink: resolve }))[0].href, '/c/x/guides/a');
  assert.equal(links(parseMarkdown('[x](bad.md)', { resolveLink: resolve })).length, 0);
  assert.equal(links(parseMarkdown('[x](a.md)')).length, 0);
});

// ── hostile input ─────────────────────────────────────────────────────────

const HOSTILE_DESTINATIONS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'JAVASCRIPT:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'ftp://example.com/x',
  'about:blank',
  'blob:https://example.com/1',
  'jar:https://example.com/x.jar!/',
  '//evil.com',
  '//evil.com/path',
  '/\\evil.com',
  '\\\\evil.com',
  'https:\\\\evil.com',
  // Whitespace and control characters smuggled into, or in front of, the scheme.
  'java\u0000script:alert(1)',
  'java\u0001script:alert(1)',
  'java\u0009script:alert(1)',
  'java\u000ascript:alert(1)',
  'java\u000dscript:alert(1)',
  '\u0001javascript:alert(1)',
  '\u001fjavascript:alert(1)',
  'java​script:alert(1)',
  'java­script:alert(1)',
  ' javascript:alert(1)',
  ' javascript:alert(1)',
  'java script:alert(1)',
  'javascript :alert(1)',
  '﻿javascript:alert(1)',
  // Entity-encoded and percent-encoded schemes.
  '&#106;avascript:alert(1)',
  '&#x6A;avascript:alert(1)',
  '&#0000106avascript:alert(1)',
  'jav&#x09;ascript:alert(1)',
  'jav&Tab;ascript:alert(1)',
  'javascript&colon;alert(1)',
  '%6Aavascript:alert(1)',
  'javascript%3Aalert(1)',
  '<javascript:alert(1)>',
  'javascript:alert(1)//https://ok.test',
];

test('hostile link destinations render as plain text, never as links', () => {
  for (const dest of HOSTILE_DESTINATIONS) {
    for (const src of [`[click me](${dest})`, `[click me](<${dest}>)`, `[**click** me](${dest} "t")`]) {
      const blocks = parseMarkdown(src);
      assert.equal(links(blocks).length, 0, `${JSON.stringify(src)} produced a link`);
      assert.doesNotMatch(JSON.stringify(blocks), /"href"/, `${JSON.stringify(src)} carries an href`);
      assert.equal(blocks.some((b) => b.type === 'image'), false);
      // The words survive: nothing is silently swallowed.
      const text = blocks.map((b) => (b.inline ? textOf(b.inline) : '')).join('');
      assert.match(text, /click\s*me|\*\*click|click/, `${JSON.stringify(src)} lost its text`);
    }
  }
});

test('hostile image sources never become an image', () => {
  for (const dest of HOSTILE_DESTINATIONS) {
    const blocks = parseMarkdown(`![pic](${dest})`);
    assert.equal(blocks.some((b) => b.type === 'image'), false, `${JSON.stringify(dest)} became an image`);
    assert.doesNotMatch(JSON.stringify(blocks), /"src"/);
    // Even with a resolver that would say yes, a refused absolute address stays refused.
    const resolved = parseMarkdown(`![pic](${dest})`, { resolveImage: (s) => s });
    assert.equal(resolved.some((b) => b.type === 'image'), false);
  }
});

test('safeUrl: the accepted forms, and the refusals', () => {
  for (const ok of [
    'https://example.com',
    'HTTPS://EXAMPLE.COM/a?b=c#d',
    'http://example.com',
    'mailto:agent@example.com',
    'tel:+18015550100',
    '/c/x/guides',
    '/guides/blog-hero-model-home.webp',
    '#top',
  ]) {
    assert.equal(safeUrl(ok), ok, ok);
  }
  for (const bad of [...HOSTILE_DESTINATIONS, '', ' https://example.com', 'https://', 'https:///x', 'mailto:', 'x.md', 'images/x.webp', null, undefined, 7, {}]) {
    assert.equal(safeUrl(bad), null, JSON.stringify(bad));
  }
  assert.equal(safeUrl('https://' + 'a'.repeat(3000)), null, 'absurdly long URLs are refused');
  assert.equal(safeUrl('/path', { allowRelative: false }), null);
  assert.equal(safeUrl('#a', { allowRelative: false }), null);
  assert.equal(safeUrl('https://example.com', { allowRelative: false }), 'https://example.com');
});

test('raw HTML is text: it is neither parsed nor dropped', () => {
  const samples = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="https://evil.test"></iframe>',
    '<a href="javascript:alert(1)">x</a>',
    '<svg onload=alert(1)>',
    '<style>body{display:none}</style>',
    '&lt;b&gt;entity&lt;/b&gt;',
  ];
  for (const sample of samples) {
    for (const src of [sample, `before ${sample} after`, `> **T** — ${sample}`, `- ${sample}`, `# ${sample}`, `**${sample}**`]) {
      const blocks = parseMarkdown(src);
      assert.equal(links(blocks).length, 0, src);
      assert.equal(blocks.some((b) => b.type === 'image'), false, src);
      // The characters are all still there, as text, for React to escape.
      const flat = markdownToText(src);
      assert.ok(flat.includes(sample.replace(/\*/g, '')), `${JSON.stringify(src)} lost the literal markup: ${flat}`);
    }
  }
  const node = firstParagraph('<img src=x onerror=alert(1)>').inline;
  assert.deepEqual(node, [{ type: 'text', value: '<img src=x onerror=alert(1)>' }]);
});

test('the AST only ever contains the documented node types', () => {
  const inlineTypes = new Set(['text', 'strong', 'em', 'link', 'code', 'br']);
  const blockTypes = new Set(['heading', 'paragraph', 'list', 'callout', 'image', 'hr']);
  for (const file of guideFiles) {
    const blocks = parseMarkdown(parseGuideMarkdown(readFileSync(join(GUIDE_DIR, file), 'utf8')).body);
    for (const b of allBlocks(blocks)) assert.ok(blockTypes.has(b.type), b.type);
    walkBlocks(blocks, (n) => assert.ok(inlineTypes.has(n.type), n.type));
  }
});

// ── robustness ────────────────────────────────────────────────────────────

/** A small seeded generator, so a failure reproduces from its seed. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const PIECES = [
  '*', '**', '***', '_', '`', '``', '[', ']', '(', ')', '![', '](', '\\', '\n', '\n\n', '> ', '>', '# ', '## ', '- ', '1. ', '2) ', '---',
  ' ', '  \n', 'a', 'word', 'B', '<script>', '</b>', 'https://x.test', 'javascript:', '"', "'", '\t', '\u0000', ' ', '&#106;', '—', '$1,000',
];

test('fuzz: thousands of random marker soups never throw, never hang, and never emit an unsafe URL', () => {
  const random = rng(20260827);
  const started = Date.now();
  let parsed = 0;
  for (let n = 0; n < 6000; n++) {
    const parts = [];
    const length = 1 + Math.floor(random() * 40);
    for (let k = 0; k < length; k++) parts.push(PIECES[Math.floor(random() * PIECES.length)]);
    const src = parts.join('');
    let blocks;
    try {
      blocks = parseMarkdown(src);
      markdownToText(src);
      parseGuideMarkdown(src, 'fuzz.md');
      JSON.stringify(blocks);
    } catch (err) {
      assert.fail(`threw on ${JSON.stringify(src)}: ${err.message}`);
    }
    for (const link of links(blocks)) assert.notEqual(safeUrl(link.href), null, `unsafe href from ${JSON.stringify(src)}`);
    for (const b of allBlocks(blocks)) if (b.type === 'image') assert.notEqual(safeUrl(b.src), null, `unsafe src from ${JSON.stringify(src)}`);
    parsed++;
  }
  assert.equal(parsed, 6000);
  // Measured at about 350 ms; the ceiling is only there to catch a parser that has gone wrong, not to time the machine.
  assert.ok(Date.now() - started < 20000, `6000 small inputs took ${Date.now() - started}ms`);
});

// How long a parse takes depends on the machine and on what else it is doing: a 130 ms input has
// been measured at 1.6 s on a busy CI runner, so a fixed millisecond bound is a coin flip there.
// What does not depend on the machine is HOW the time grows. A linear scan takes four times as long
// on four times the input; a quadratic one takes sixteen. Timing the same shape at two sizes, back
// to back on the same machine, cancels out how fast or how busy it is.
function fastest(work, tries = 3) {
  let best = Infinity;
  for (let attempt = 0; attempt < tries; attempt++) {
    const started = Date.now();
    work();
    best = Math.min(best, Date.now() - started);
    // Quick enough that it will not be compared anyway: more runs only cost time.
    if (best < TOO_QUICK_MS) break;
  }
  return best;
}

// Below this a run is too quick to time (a millisecond of noise is a large fraction of it), so a
// shape that small is held to a generous ceiling on the larger run instead of to a ratio.
const TOO_QUICK_MS = 20;
const CEILING_MS = 5000;
const MAX_GROWTH = 9; // linear is about 4, quadratic about 16

/** `build(n)` makes the shape from a count; it is timed at count/4 and at count. */
function assertLinear(label, count, build, work) {
  const small = build(Math.round(count / 4));
  const large = build(count);
  const tSmall = fastest(() => work(small));
  const tLarge = fastest(() => work(large));
  if (tSmall >= TOO_QUICK_MS) {
    // Measurable at both sizes: judged by how the time grew, which a slow or busy machine does not change.
    assert.ok(
      tLarge < tSmall * MAX_GROWTH,
      `${label}: ${large.length / small.length}x the input took ${(tLarge / tSmall).toFixed(1)}x as long (${tSmall}ms to ${tLarge}ms), which is not linear`,
    );
  } else {
    // Too quick to compare, so all that can be said is that the larger one did not run away.
    assert.ok(tLarge < CEILING_MS, `${label}: ${tLarge}ms for ${large.length} characters`);
  }
}

test('pathological repeats stay linear: unclosed markers do not go quadratic', () => {
  const shapes = [
    [60000, (n) => '*'.repeat(n)],
    [15000, (n) => '**a '.repeat(n)],
    [20000, (n) => '*a '.repeat(n)],
    [10000, (n) => '***x '.repeat(n)],
    [30000, (n) => '['.repeat(n)],
    [8000, (n) => '[a]('.repeat(n)],
    [8000, (n) => '![a]('.repeat(n)],
    [20000, (n) => '[a](' + 'b '.repeat(n)],
    [40000, (n) => '`'.repeat(n)],
    [20000, (n) => '`a '.repeat(n)],
    [20000, (n) => '> '.repeat(n)],
    [20000, (n) => '>\n'.repeat(n)],
    [20000, (n) => '- '.repeat(n)],
    [20000, (n) => '1. '.repeat(n)],
    [40000, (n) => '\\'.repeat(n)],
    [60000, (n) => '\n'.repeat(n)],
    [120000, (n) => ' '.repeat(n) + '#'],
    [80000, (n) => '# ' + ' '.repeat(n) + 'x #'],
    [30000, (n) => '> **' + 'a '.repeat(n)],
    [80000, (n) => '**' + ' '.repeat(n)],
    [40000, (n) => '('.repeat(n) + '[x](' + ')'.repeat(n)],
    [20000, (n) => 'a  \n'.repeat(n)],
  ];
  for (const [count, build] of shapes) {
    assertLinear(JSON.stringify(build(3).slice(0, 20)), count, build, (src) => { parseMarkdown(src); markdownToText(src); });
  }
});

// The shapes that took 3 to 50 seconds on a 60KB body (a trailing-space regex that retried from every
// space) went unnoticed because their inputs were never of this form. Each is held to linear growth.
test('long runs of interior spaces and tabs are cheap: no regex retries from every space', () => {
  const shapes = {
    'interior spaces': [50000, (n) => 'a' + ' '.repeat(n) + 'b'],
    'interior tabs (four spaces each once expanded)': [15000, (n) => 'a' + '\t'.repeat(n) + 'b'],
    'a title line padded with spaces': [50000, (n) => '# a' + ' '.repeat(n) + '#'],
    'a title with a run of spaces in the middle of its text': [50000, (n) => '# a' + ' '.repeat(n) + 'b'],
  };
  for (const [name, [count, build]] of Object.entries(shapes)) {
    assertLinear(name, count, build, (src) => { parseMarkdown(src); markdownToText(src); parseGuideMarkdown(src, 'x.md'); });
  }
});

test('unclosed brackets and very many short lines stay cheap', () => {
  const shapes = {
    'a wall of [': [120000, (n) => '['.repeat(n)],
    'a [ on every line': [60000, (n) => '\n['.repeat(n)],
    'one-letter lines in one paragraph': [60000, (n) => 'a\n'.repeat(n)],
  };
  for (const [name, [count, build]] of Object.entries(shapes)) {
    assertLinear(name, count, build, (src) => parseMarkdown(src));
  }
});

test('trailing spaces and line breaks read the same as before the linear rewrite', () => {
  const inline = (src) => firstParagraph(src).inline;
  // Two trailing spaces make a hard break, one does not, and spaces before a break are dropped.
  assert.deepEqual(inline('a  \nb'), [{ type: 'text', value: 'a' }, { type: 'br' }, { type: 'text', value: 'b' }]);
  assert.deepEqual(inline('a \nb'), [{ type: 'text', value: 'a b' }]);
  assert.deepEqual(inline('a\nb'), [{ type: 'text', value: 'a b' }]);
  // Interior spaces survive; spaces at the very end of a paragraph do not.
  assert.deepEqual(inline('a   b'), [{ type: 'text', value: 'a   b' }]);
  assert.deepEqual(inline('a b   '), [{ type: 'text', value: 'a b' }]);
  // A space on either side of an emphasis run stays on its own side.
  assert.equal(textOf(inline('x **y** z')), 'x y z');
  assert.equal(textOf(inline('x  *y*  z')), 'x  y  z');
  // An empty image alt in mid-sentence must not double the space before the break after it.
  assert.equal(textOf(inline('\t# ![]()\n**')), '# **');
});

test('link labels pair their brackets: nested and escaped brackets, and an unclosed one before a good link', () => {
  const href = 'https://x.test';
  assert.equal(links(parseMarkdown(`[a [b] c](${href})`))[0].href, href);
  assert.equal(textOf(firstParagraph(`[a [b] c](${href})`).inline), 'a [b] c');
  assert.equal(textOf(firstParagraph(`[a \\] b](${href})`).inline), 'a ] b');
  const after = firstParagraph(`[[[ never closed [ok](${href}) tail`);
  assert.equal(links([{ inline: after.inline, type: 'paragraph' }])[0].href, href);
  // A label longer than the cap is text, not a link, however it closes.
  assert.equal(links(parseMarkdown(`[${'a'.repeat(1100)}](${href})`)).length, 0);
});

test('nesting is bounded: deep emphasis and deep quotes do not overflow the stack', () => {
  const deepEm = '*a '.repeat(3000) + 'z' + '*'.repeat(3000);
  const deepBold = '**a '.repeat(3000) + 'z' + '**'.repeat(3000);
  const deepLink = '[a'.repeat(3000) + '](https://x.test)';
  const deepQuote = '> '.repeat(500) + 'x';
  for (const src of [deepEm, deepBold, deepLink, deepQuote]) {
    assert.doesNotThrow(() => parseMarkdown(src));
  }
});

test('odd input types and unclosed markers: empty, null, CRLF, BOM, lone markers', () => {
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(parseMarkdown(null), []);
  assert.deepEqual(parseMarkdown(undefined), []);
  assert.deepEqual(parseMarkdown('   \n \n'), []);
  assert.equal(parseMarkdown('﻿# Title\r\n\r\ntext\r\n').length, 2);
  for (const src of ['**', '*', '`', '[', '![', '[x]', '[x](', '[x](y', '> ', '#', '1.', '-', '\\', '**a', '*a', '`a', '[a](https://x', '![a](', '> **', '> **a']) {
    assert.doesNotThrow(() => parseMarkdown(src), src);
  }
  assert.equal(textOf(firstParagraph('**unclosed bold').inline), '**unclosed bold');
  assert.equal(textOf(firstParagraph('a [link](').inline), 'a [link](');
});

// ── markdownToText ────────────────────────────────────────────────────────

test('markdownToText strips every kind of markup and keeps the words', () => {
  const src = [
    '# Heading **one**',
    '',
    'A *soft* paragraph with **strong**, `code`, a [link](https://x.test) and a [bad](javascript:alert(1)) one.',
    '',
    '- bullet one',
    '1. numbered',
    '',
    '> **Callout** — the body',
    '',
    '---',
    '',
    'hard  ',
    'break',
  ].join('\n');
  const text = markdownToText(src);
  assert.equal(
    text,
    ['Heading one', 'A soft paragraph with strong, code, a link and a bad one.', 'bullet one', 'numbered', 'Callout the body', 'hard\nbreak'].join('\n'),
  );
  assert.doesNotMatch(text, /[*`#>[\]]|\]\(|---/);
  assert.equal(markdownToText(''), '');
  assert.equal(markdownToText(null), '');
});

// ── the loader ────────────────────────────────────────────────────────────

test('loadDefaultGuides returns the 13 supplied guides in the fixed order with unique slugs', () => {
  const guides = loadDefaultGuides();
  assert.equal(guides.length, 13);
  assert.deepEqual(
    guides.map((g) => g.slug),
    SPEC_ORDER,
  );
  assert.deepEqual(DEFAULT_GUIDE_ORDER, SPEC_ORDER);
  assert.equal(new Set(guides.map((g) => g.slug)).size, 13);
  assert.equal(new Set(guides.map((g) => g.title)).size, 13, 'titles are distinct too');
  for (const g of guides) {
    assert.equal(g.defaultKey, g.slug);
    assert.deepEqual(Object.keys(g).sort(), ['body', 'byline', 'category', 'defaultKey', 'imageAlt', 'note', 'slug', 'summary', 'title']);
    assert.match(g.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(g.body.length > 500, `${g.slug} body is suspiciously short`);
  }
  assert.equal(guides[0].slug, 'how-much-house-can-you-afford-northern-utah');
  assert.equal(guides[12].slug, '16-questions-to-ask-before-buying-a-new-construction-townhome-in-utah');
});

test('loadDefaultGuides is cached but hands out copies a caller can safely edit', () => {
  const a = loadDefaultGuides();
  a[0].title = 'EDITED';
  a.pop();
  const b = loadDefaultGuides();
  assert.equal(b.length, 13);
  assert.notEqual(b[0].title, 'EDITED');
});

test('loadDefaultGuides works from a different working directory', () => {
  const loader = pathToFileURL(join(here, '..', 'lib', 'guides.js')).href;
  const script = `import(${JSON.stringify(loader)}).then((m) => { const g = m.loadDefaultGuides(); process.stdout.write(JSON.stringify(g.map((x) => x.slug))); });`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: tmpdir(), encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out), SPEC_ORDER);
});

test('every .md file in server/content/guides is listed in DEFAULT_GUIDE_ORDER (a new article must be placed on purpose)', () => {
  const onDisk = guideFiles.map((f) => f.slice(0, -3)).sort();
  const listed = [...DEFAULT_GUIDE_ORDER].sort();
  const unlisted = onDisk.filter((slug) => !listed.includes(slug));
  assert.deepEqual(
    unlisted,
    [],
    `Add ${unlisted.join(', ')} to DEFAULT_GUIDE_ORDER in server/lib/guides.js to say where it sits in the buyer journey. ` +
      'Until you do it is still loaded, appended alphabetically after the others.',
  );
  assert.deepEqual(listed.filter((slug) => !onDisk.includes(slug)), [], 'DEFAULT_GUIDE_ORDER names a file that does not exist');
  assert.equal(new Set(DEFAULT_GUIDE_ORDER).size, DEFAULT_GUIDE_ORDER.length, 'no slug is listed twice');
});

test('a guide that is not in the list is still loaded, appended alphabetically after the listed ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guides-'));
  try {
    // Two listed guides copied in reverse of their listed order, plus three unlisted names
    // dropped in out of alphabetical order, and a file that is not Markdown at all.
    copyFileSync(join(GUIDE_DIR, 'closing-costs-utah-homebuyer.md'), join(dir, 'closing-costs-utah-homebuyer.md'));
    copyFileSync(join(GUIDE_DIR, 'credit-score-buy-house-utah.md'), join(dir, 'credit-score-buy-house-utah.md'));
    for (const name of ['zeta-new-article', 'alpha-new-article', 'mid-new-article']) {
      copyFileSync(join(GUIDE_DIR, 'townhome-vs-house-utah.md'), join(dir, `${name}.md`));
    }
    copyFileSync(join(GUIDE_DIR, 'townhome-vs-house-utah.md'), join(dir, 'notes.txt'));
    const slugs = readGuidesFrom(dir).map((g) => g.slug);
    assert.deepEqual(slugs, [
      'credit-score-buy-house-utah',
      'closing-costs-utah-homebuyer',
      'alpha-new-article',
      'mid-new-article',
      'zeta-new-article',
    ]);
    assert.deepEqual(orderGuideSlugs(['b-new', 'closing-costs-utah-homebuyer', 'a-new']), ['closing-costs-utah-homebuyer', 'a-new', 'b-new']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a guide with no header still loads, using the file name for a title and never throwing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guides-'));
  try {
    mkdirSync(dir, { recursive: true });
    const parsed = parseGuideMarkdown('Just a paragraph with no header at all.', 'a-plain-note.md');
    assert.equal(parsed.title, 'A plain note');
    assert.equal(parsed.summary, 'Just a paragraph with no header at all.');
    assert.equal(parsed.body, 'Just a paragraph with no header at all.');
    assert.equal(parsed.category, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a picture further down the article is body, not the hero', () => {
  const parsed = parseGuideMarkdown('# T\n\n*Cat*\n\nlede text.\n\n## S\n\n![mid](https://x.test/m.png)\n\nmore.', 't.md');
  assert.equal(parsed.imageSrc, '');
  assert.ok(parsed.body.includes('![mid]'));
});

test('summary is clipped at a word boundary to 400 characters with an ellipsis', () => {
  const long = 'word '.repeat(200).trim();
  const parsed = parseGuideMarkdown(`# T\n\n*Cat*\n\n![a](images/x.webp)\n\n${long}\n\nsecond`, 't.md');
  assert.ok(parsed.summary.length <= 400);
  assert.ok(parsed.summary.length > 350, 'it keeps nearly all of the allowance rather than clipping early');
  assert.ok(parsed.summary.endsWith('…'));
  assert.doesNotMatch(parsed.summary, /wor…$/);
});

test('the hero picture address passes the same allow-list as every other URL', () => {
  const hero = (dest) => parseGuideMarkdown(`# T\n\n*Cat*\n\n![a](${dest})\n\nLede`, 'x.md').imageSrc;
  for (const hostile of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', '<data:text/html,x y>', 'data:image/svg+xml,x', 'vbscript:x', '//evil.test/x.png']) {
    assert.equal(hero(hostile), '', `${hostile} must not come back as an image source`);
  }
  assert.equal(hero('https://x.test/h.webp'), 'https://x.test/h.webp');
  assert.equal(hero('/guides/h.webp'), '/guides/h.webp');
  // A bare relative name is inert; it is handed back for the caller to map to a file.
  assert.equal(hero('images/h.webp'), 'images/h.webp');
  // A resolver maps it, and its answer is checked like authored text.
  const src = '# T\n\n*Cat*\n\n![a](images/h.webp)\n\nLede';
  assert.equal(parseGuideMarkdown(src, 'x.md', { resolveImage: (s) => `/guides/${s.replace('images/', '')}` }).imageSrc, '/guides/h.webp');
  assert.equal(parseGuideMarkdown(src, 'x.md', { resolveImage: () => 'javascript:alert(1)' }).imageSrc, '');
});
