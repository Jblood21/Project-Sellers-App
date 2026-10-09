import { useLayoutEffect } from 'react';

import { fitHeadingSize } from '@shared/fitText.js';

/** How many lines an inline element is drawn on: its boxes, counted by how far down they start. */
function lineCount(node) {
  const tops = new Set();
  for (const rect of node.getClientRects()) if (rect.width > 0) tops.add(Math.round(rect.top));
  return tops.size || 1;
}

/**
 * Sizes a headline to its text. The heading holds one <span> with the words in it; the size is set as
 * `--welcome-size` on the heading, which the stylesheet falls back from (so without script it is the
 * layout's own size, as before). Measured before the first paint, and again when the heading's width
 * changes (a rotated phone, a resized window) and when a web font finishes loading and the words
 * change width. The choice itself is `fitHeadingSize` in shared/fitText.js.
 */
export default function useFitHeading(ref, text) {
  useLayoutEffect(() => {
    const heading = ref.current;
    const words = heading?.firstElementChild;
    if (!heading || !words) return undefined;
    let live = true;
    let width = -1;
    let frame = 0;

    const fit = () => {
      if (!live) return;
      // The layout's own size is what the heading has with nothing set.
      heading.style.removeProperty('--welcome-size');
      const base = parseFloat(getComputedStyle(heading).fontSize);
      const size = fitHeadingSize({
        base,
        linesAt: (px) => {
          heading.style.setProperty('--welcome-size', `${px}px`);
          return lineCount(words);
        },
      });
      if (size) heading.style.setProperty('--welcome-size', `${size}px`);
      else heading.style.removeProperty('--welcome-size');
      width = heading.clientWidth;
    };

    fit();
    // Only a change of width matters; the heading changing height because of its own size must not loop.
    // Done on the next frame, not inside the callback: the refit changes the heading's own height, and doing
    // that while the browser is still delivering resize notifications makes it report an error each time.
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        if (heading.clientWidth === width) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(fit);
      })
      : null;
    observer?.observe(heading);
    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', fit);
    fonts?.ready?.then(fit).catch(() => {});

    return () => {
      live = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      fonts?.removeEventListener?.('loadingdone', fit);
      heading.style.removeProperty('--welcome-size');
    };
  }, [ref, text]);
}
