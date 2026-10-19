import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMPLIANCE_DEFAULTS, complianceOf } from '../../shared/compliance.js';
import { pdfImageFrom } from './pdfImage.js';

/**
 * Who the lead reports are prepared by: the lender a community has set in Setup, with their logo.
 *
 * The logo is the one uploaded in Setup. Without one, the supplied Summit Home Loans logo is used only while the lender
 * is still Summit Home Loans: a report for another lender carries that lender's name instead of somebody else's mark
 * (the buyer app shows the supplied logo regardless, with a note in Setup asking for theirs; a document handed to a
 * builder's team should not). A logo the PDF writer cannot read (a WebP or GIF upload) gives the name as well.
 */

const SUPPLIED_LOGO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'public', 'brand', 'summit-home-loans-color.png');

let supplied;
/** The supplied logo, read once. Null if the file is missing (a trimmed deploy), never an error. */
function suppliedLogo() {
  if (supplied === undefined) {
    try {
      supplied = pdfImageFrom(readFileSync(SUPPLIED_LOGO));
    } catch {
      supplied = null;
    }
  }
  return supplied;
}

const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/**
 * The lender as the reports print them: { name, nmls, phone, email, website, address, lo, logo }. `name` is '' when
 * Setup has no lender, and then the reports say nothing about one. `logo` is a picture for the PDF writer, or null.
 */
export function lenderBrandOf(community, { logo = null } = {}) {
  const { lender, lo } = complianceOf(community?.settings, { community: community ?? {} });
  const usesSupplied = !logo && lender.name && sameName(lender.name, COMPLIANCE_DEFAULTS.lenderName);
  return {
    name: lender.name,
    nmls: lender.nmls,
    phone: lender.phone,
    email: lender.email,
    website: lender.website,
    address: lender.address,
    lo,
    logo: logo ?? (usesSupplied ? suppliedLogo() : null),
  };
}

/**
 * Uploaded logos already read, by photo id. A new upload is a new photo with a new id, so an entry never goes stale;
 * the oldest goes once there are more than a few, so a server with many communities holds only recent ones.
 */
const decoded = new Map();
const DECODED_KEPT = 24;

/** The same, with the logo uploaded in Setup read from the store. */
export async function loadLenderBrand(store, community) {
  const [photo] = community?.id ? await store.listCommunityPhotos(community.id, 'lenderlogo') : [];
  if (!photo) return lenderBrandOf(community);
  if (!decoded.has(photo.id)) {
    const file = await store.getPhotoData(photo.id);
    decoded.set(photo.id, file?.data ? pdfImageFrom(Buffer.from(file.data, 'base64')) : null);
    if (decoded.size > DECODED_KEPT) decoded.delete(decoded.keys().next().value);
  }
  const logo = decoded.get(photo.id);
  // An uploaded logo that cannot be drawn (a WebP, or one stored as a link) gives the name, never the supplied mark.
  return { ...lenderBrandOf(community, { logo }), logo };
}

/** "Summit Home Loans · NMLS #1790749", or '' when there is no lender. */
export function lenderTitle(brand) {
  if (!brand?.name) return '';
  return `${brand.name}${brand.nmls ? ` · NMLS #${brand.nmls}` : ''}`;
}

/** How to reach the lender, in one line: phone, email, website. */
export function lenderContact(brand) {
  if (!brand?.name) return '';
  return [brand.phone, brand.email, brand.website].filter(Boolean).join(' · ');
}
