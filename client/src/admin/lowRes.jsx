import { useCallback, useState } from 'react';

import { naturalSize, storedSize } from '../lib/pictureSize.js';

/**
 * How large a picture has to be to look sharp everywhere it is used, by slot, and what
 * the builder is told when it is not. Uploads keep up to 4096 px (lib/photos.js) and the
 * server never enlarges, so a picture that was small when it was picked stays small: the
 * only fix is a bigger original, which only the builder has. The note says so once,
 * beside the picture, and does not stop anything.
 *
 * The widths are where softness starts to show on common screens, not the most a slot
 * can use. A hero or home photo is drawn up to about 1440 CSS px wide on a laptop, 2880
 * on its retina screen, and anything under 1920 is visibly stretched there. A floor plan
 * is measured on its long edge, since a tall one is drawn to the height of the screen.
 * The logo widths are what a sharp phone screen draws them at (219 x 64 for the lender
 * logo, 151 x 44 for the community's, 96 x 28 for a brokerage's, at 3x).
 */
const photoNote = (width) => `This picture is ${width} pixels wide, so it can look blurry on big screens. Use the original photo if you have it.`;
const logoNote = (width) => `This logo is ${width} pixels wide, so it can look soft on sharp phone screens. Use a larger PNG of it if you have one.`;

export const PICTURE_NEEDS = {
  hero: { width: 1920, say: photoNote },
  home: {
    width: 1920,
    say: photoNote,
    sayMany: (list) => `Photos ${list} are under 1920 pixels wide, so they can look blurry on big screens. Use the original photos if you have them.`,
  },
  highlight: { width: 1200, say: photoNote },
  sitemap: {
    width: 1920,
    say: (width) => `This site map is ${width} pixels wide, so lot numbers can be hard to read when buyers zoom in. Use the original file if you have it.`,
  },
  floorplan: {
    width: 1600,
    edge: true,
    say: (width) => `This plan is ${width} pixels across, so room sizes can be hard to read when buyers zoom in. Use the original file if you have it.`,
    sayMany: (list) => `Plans ${list} are under 1600 pixels across, so room sizes can be hard to read when buyers zoom in. Use the original files if you have them.`,
  },
  icon: {
    width: 512,
    say: (width) => `This icon is ${width} pixels wide, so it can look blurry on a phone's home screen. Use one at least 512 pixels square if you have it.`,
  },
  portrait: {
    width: 330,
    say: (width) => `This photo is ${width} pixels wide, so it can look soft on sharp phone screens. Use the original photo if you have it.`,
  },
  logo: { width: 460, say: logoNote },
  logolight: { width: 460, say: logoNote },
  lenderlogo: { width: 660, say: logoNote },
  agentlogo: { width: 290, say: logoNote },
};

/** What to tell the builder about a picture of `size` used as `use`, or '' when it is big enough. */
export function lowResNote(use, size) {
  const need = PICTURE_NEEDS[use];
  if (!need || !size?.width || !size?.height) return '';
  const measured = need.edge ? Math.max(size.width, size.height) : size.width;
  return measured < need.width ? need.say(measured) : '';
}

/** Measures a loaded <img> in a slot and hands the stored picture's size to `onMeasure`. */
export const measureImg = (onMeasure) => (event) => {
  storedSize(event.currentTarget).then((size) => size && onMeasure(size));
};

/**
 * The note for one slot showing `url`. `picked(size)` is called with the size of a picture
 * as soon as it is picked, so the note appears while it uploads, and with null if the
 * upload fails; `measured(size)` is for the slot's picture once it loads (Photo's
 * onMeasure). A measurement belongs to the address it was taken from, so a removed or
 * replaced picture's note goes with it.
 */
export function useLowRes(use, url) {
  const [picked, setPicked] = useState(null);
  const [measured, setMeasured] = useState(null);
  const size = picked ?? (measured && measured.url === url ? measured.size : null);
  const onMeasure = useCallback((next) => {
    setPicked(null);
    setMeasured({ url, size: next });
  }, [url]);
  return { note: lowResNote(use, size), picked: setPicked, measured: onMeasure };
}

/**
 * The same for a row of pictures (a home's photos, its floor plans): sizes by address,
 * and the positions (from 1) of the ones that are too small, in the order given.
 */
export function useLowResRow(use, urls) {
  const [sizes, setSizes] = useState(() => new Map());
  const measured = useCallback((url, size) => {
    setSizes((current) => {
      const known = current.get(url);
      if (known && known.width === size.width && known.height === size.height) return current;
      return new Map(current).set(url, size);
    });
  }, []);
  const small = urls
    .map((url, index) => ({ position: index + 1, url, note: lowResNote(use, sizes.get(url)) }))
    .filter((entry) => entry.note);
  return { small, measured };
}

/**
 * One note for a row: the picture's own note when one is too small ("Photo 3: This
 * picture is…"), or one line naming all of them. `noun` is what one of them is called.
 */
export function rowNote(use, small, noun) {
  if (!small.length) return '';
  if (small.length === 1) return `${noun} ${small[0].position}: ${small[0].note}`;
  const positions = small.map((entry) => entry.position);
  const list = `${positions.slice(0, -1).join(', ')} and ${positions.at(-1)}`;
  return PICTURE_NEEDS[use].sayMany(list);
}

/** The size of a picture that has just been picked, from the data URL about to be uploaded. */
export const pickedSize = (dataUrl) => naturalSize(dataUrl);

/** The note itself: one calm line under the picture, or nothing. */
export function LowResNote({ children }) {
  if (!children) return null;
  return <p className="ax-lowres" role="note">{children}</p>;
}
