/**
 * The live preview Setup's theme studio shows: the buyer app's own home screen, in the community's real
 * layout and data, drawn in a page of its own (/c/<id>/preview) inside a frame. Setup tells the frame what
 * to wear with a message, so trying on a theme or moving the colour wheel repaints it at once without a
 * reload. Both sides import this file, so they cannot disagree about the message.
 *
 * The message: { type: PREVIEW_MESSAGE, theme, layout, settings }
 *   theme     a THEMES key, or 'custom'
 *   layout    a LAYOUT_KEYS key
 *   settings  for 'custom', the four custom colour settings (customBrand, customButton, customPage, customBase)
 *
 * Only a message from the page's own parent, at the same origin, is listened to.
 */
export const PREVIEW_MESSAGE = 'touradoor:theme-preview';

/** The frame's address. The theme and layout are in it too, so the first paint is already right. */
export function previewPath(communityId, { theme, layout } = {}) {
  const query = new URLSearchParams();
  if (theme) query.set('theme', theme);
  if (layout) query.set('layout', layout);
  const text = query.toString();
  return `/c/${encodeURIComponent(communityId)}/preview${text ? `?${text}` : ''}`;
}

/** What Setup posts to a preview frame. */
export function previewMessage({ theme, layout, settings }) {
  return { type: PREVIEW_MESSAGE, theme, layout, settings: settings ?? {} };
}
