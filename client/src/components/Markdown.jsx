import { useMemo } from 'react';

import { parseMarkdown } from '@shared/markdown.js';
import '../styles/guides.css';

/**
 * Renders guide Markdown as React elements.
 *
 * It walks the AST from `shared/markdown.js` and builds elements, so React
 * escapes every string: there is no `dangerouslySetInnerHTML` anywhere, and an
 * `<img onerror=...>` typed into a guide is just those characters on screen.
 * The parser has already refused every URL that is not https, http, mailto, tel,
 * a site path or an anchor, so an `href` or `src` here is safe to emit as is.
 *
 * Props
 *   source           the Markdown text
 *   resolveLink      optional (href) => url, for scheme-less links such as `other-guide.md`
 *   resolveImage     optional (src) => url, for scheme-less images; without it they are dropped
 *   onInternalLink   optional (href) => void, called for site-path links so a router can
 *                    navigate without a page load; the browser default is cancelled
 *   className        extra class on the wrapper
 *
 * Headings: the page owns the one `h1`, so a `#` inside a body renders as an `h2`.
 */
export default function Markdown({ source, resolveLink, resolveImage, onInternalLink, className = '' }) {
  const blocks = useMemo(
    () => parseMarkdown(source, { resolveLink, resolveImage }),
    [source, resolveLink, resolveImage],
  );
  return <div className={`md ${className}`.trim()}>{renderBlocks(blocks, onInternalLink)}</div>;
}

function renderBlocks(blocks, onInternalLink) {
  return blocks.map((block, i) => renderBlock(block, i, onInternalLink));
}

function renderBlock(block, key, onInternalLink) {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level >= 3 ? 'h3' : 'h2';
      return (
        <Tag key={key} className={Tag === 'h3' ? 'md-h3' : 'md-h2'}>
          {renderInline(block.inline, onInternalLink)}
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p key={key} className="md-p">
          {renderInline(block.inline, onInternalLink)}
        </p>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag key={key} className={block.ordered ? 'md-ol' : 'md-ul'} start={block.ordered ? block.start : undefined}>
          {block.items.map((item, n) => (
            <li key={n} className="md-li">
              {renderInline(item, onInternalLink)}
            </li>
          ))}
        </Tag>
      );
    }
    case 'callout':
      return (
        <aside key={key} className="md-callout">
          {block.title && <p className="md-callout__title">{block.title}</p>}
          {block.inline.length > 0 && <p className="md-callout__text">{renderInline(block.inline, onInternalLink)}</p>}
          {block.more && renderBlocks(block.more, onInternalLink)}
        </aside>
      );
    case 'image':
      return <img key={key} className="md-img" src={block.src} alt={block.alt} loading="lazy" decoding="async" />;
    case 'hr':
      return <hr key={key} className="md-hr" />;
    default:
      return null;
  }
}

function renderInline(nodes, onInternalLink) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'strong':
        return <strong key={i}>{renderInline(node.children, onInternalLink)}</strong>;
      case 'em':
        return <em key={i}>{renderInline(node.children, onInternalLink)}</em>;
      case 'code':
        return <code key={i}>{node.value}</code>;
      case 'br':
        return <br key={i} />;
      case 'link': {
        const external = /^https?:/i.test(node.href);
        const internal = node.href.startsWith('/') && onInternalLink;
        return (
          <a
            key={i}
            className="md-link"
            href={node.href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            onClick={
              internal
                ? (event) => {
                    // Let a modified click (new tab, new window) behave as the browser intends.
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    onInternalLink(node.href);
                  }
                : undefined
            }
          >
            {renderInline(node.children, onInternalLink)}
          </a>
        );
      }
      default:
        return null;
    }
  });
}
