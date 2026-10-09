/**
 * How big a headline can be and still sit comfortably on its screen.
 *
 * The landing page says "Welcome to <name>", and the name is typed by the builder: "Oak" and "The Reserve
 * at Willow Creek Estates, Phase Two" have to look right at the same size setting. The page cannot know
 * how wide a name is, so it asks the browser: `linesAt(px)` is how many lines the headline takes at that
 * font size, and this picks the size.
 *
 *  - Two lines is the shape the page is built for. The biggest size (up to `maxScale` times the layout's
 *    own size, so a short name is not left small) that fits in two lines wins, as long as it is not
 *    shrunk below `comfortable` times the layout's size.
 *  - Past that the headline may take three lines instead, at the biggest size that fits in three, but no
 *    bigger than that `comfortable` size: so a longer name is never given a bigger size than a shorter
 *    one, and the size shrinks smoothly as the name grows.
 *  - A name that will not fit even then (one very long word) gets the smallest size, `minScale`, which is
 *    still a headline, and the browser wraps what is left.
 *
 * Pure: the browser measurement is passed in, so the choice can be tested without a browser.
 * Returns a size in pixels (to a tenth, rounded down, and never below the smallest), or null when there is
 * nothing to size from.
 */
export function fitHeadingSize({
  base, linesAt, maxScale = 1.2, minScale = 0.65, comfortable = 0.8, snug = 2, roomy = 3,
}) {
  if (!(base > 0) || typeof linesAt !== 'function') return null;
  const floor = base * minScale;
  const round = (px) => Math.max(floor, Math.floor(px * 10) / 10);

  // The largest size, no bigger than `ceiling`, that fits in `limit` lines; null when even the smallest does not.
  const largest = (limit, ceiling) => {
    if (linesAt(floor) > limit) return null;
    if (linesAt(ceiling) <= limit) return ceiling;
    let low = floor;
    let high = ceiling;
    for (let step = 0; step < 9; step += 1) {
      const middle = (low + high) / 2;
      if (linesAt(middle) <= limit) low = middle; else high = middle;
    }
    return low;
  };

  const snugSize = largest(snug, base * maxScale);
  if (snugSize != null && snugSize >= base * comfortable) return round(snugSize);
  return round(largest(roomy, base * comfortable) ?? floor);
}
