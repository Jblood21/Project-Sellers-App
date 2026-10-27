import { money, num } from '@shared/domain.js';

export { money, num };

/**
 * "3 bd · 2 ba · 1,850 sq ft", leaving out whichever of the three the builder did not give. A blank box is stored
 * as 0, meaning "not given" rather than none, and printing it would put "0 bd" or "0 sq ft" in front of a buyer
 * for a plan that simply has not been measured yet. Empty when none were given.
 */
export function homeMeta(home) {
  const beds = Number(home.beds) || 0;
  const baths = Number(home.baths) || 0;
  const sqft = Number(home.sqft) || 0;
  return [
    beds > 0 ? `${beds} bd` : '',
    baths > 0 ? `${baths} ba` : '',
    sqft > 0 ? `${sqft.toLocaleString('en-US')} sq ft` : '',
  ].filter(Boolean).join(' · ');
}

export function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** 'Oct 2, 2026'. The year is kept: a rate quoted without one is open to being read as last year's. */
export function fullDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function dateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function longDate(value = new Date()) {
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function monthYear(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function shortMonthYear(date) {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function firstName(fullName) {
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}
