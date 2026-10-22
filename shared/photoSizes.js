/**
 * The widths an uploaded picture is served at, and the addresses that ask for them.
 *
 * The server (server/lib/photoSizes.js) makes a copy of a stored photo at any of these
 * widths on request, and the client lists them in every srcset, so the two always agree
 * on the same handful of addresses. A width outside this list would still be answered
 * (the server rounds it up to the next one), but each distinct address is a separate
 * entry in every browser cache for what are the same bytes.
 *
 * The top is the widest picture an upload keeps (client/src/lib/photos.js): all of a
 * 12-megapixel phone photo (4032 px), which a Showcase slide filling a 1920 px retina
 * screen, or cropped to the height of a 3x phone held upright, needs every pixel of. And
 * 4096 x 4096 is as large a canvas as iPhone Safari will draw. Nothing is ever served
 * wider than it was uploaded, so on an older, smaller photo the larger steps all answer
 * with the original.
 */
export const PHOTO_WIDTHS = Object.freeze([320, 480, 640, 960, 1280, 1600, 1920, 2560, 3200, 4096]);

export const LARGEST_PHOTO_WIDTH = PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1];

// A photo this app stores is served at /api/photos/<id>. A link a builder pasted instead
// of a file is another site's address, which has no copies at other sizes, and a picture
// still waiting to upload is a data: URL; both are used exactly as they are.
const OWN_PHOTO = /^\/api\/photos\/[A-Za-z0-9_-]+$/;

/** Whether `url` is a photo stored here, which can be asked for at a width. */
export const isOwnPhoto = (url) => typeof url === 'string' && OWN_PHOTO.test(url);

/** The step of the ladder that covers `width` pixels: the smallest one at least that wide. */
export const photoStep = (width) => PHOTO_WIDTHS.find((step) => step >= width) ?? LARGEST_PHOTO_WIDTH;

/**
 * `url` at the step that covers `width` pixels, or `url` itself when it is not a photo
 * stored here. For the places that show one fixed size (an app icon, a share preview).
 */
export function photoAtWidth(url, width) {
  if (!isOwnPhoto(url)) return url;
  return `${url}?w=${photoStep(width)}`;
}

/**
 * A srcset listing every width on the ladder, or undefined for a picture that is not
 * stored here. The browser picks one from it with the `sizes` it is given, its own
 * screen density and what it already has cached.
 */
export function photoSrcSet(url) {
  if (!isOwnPhoto(url)) return undefined;
  return PHOTO_WIDTHS.map((width) => `${url}?w=${width} ${width}w`).join(', ');
}
