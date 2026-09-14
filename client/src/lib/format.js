import { money, num } from '@shared/domain.js';

export { money, num };

export function homeMeta(home) {
  const sqft = Number(home.sqft || 0).toLocaleString('en-US');
  return `${home.beds} bd · ${home.baths} ba · ${sqft} sq ft`;
}

export function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
