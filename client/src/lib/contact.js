import { useEffect, useState } from 'react';

import { telHref } from '@shared/compliance.js';

/**
 * Links that start a message or a call, and the one decision they all share:
 * a phone can text, a desktop cannot, so a prefilled message goes to a text
 * message on a phone and to an email on a computer.
 */

// An address that is only an address. The server accepts anything with an @, and
// "a@b.co?bcc=somebody" in a mailto: link would add recipients to the buyer's
// draft, so a value with those characters is never linked.
const MAILTO_SAFE = /^[^\s@?&#<>"%,;]+@[^\s@?&#<>"%,;]+\.[^\s@?&#<>"%,;]+$/;

export const safeEmail = (value) => {
  const email = String(value ?? '').trim();
  return MAILTO_SAFE.test(email) ? email : '';
};

/** True on a phone or tablet: the device can text, and a call or text is what the buyer expects. */
export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches;
  const agent = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator?.userAgent ?? '');
  return Boolean(coarse || agent);
}

/** isMobileDevice as state, so a window that is resized or a device that is rotated stays right. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(isMobileDevice);
  useEffect(() => {
    const query = window.matchMedia?.('(hover: none) and (pointer: coarse)');
    if (!query?.addEventListener) return undefined;
    const update = () => setMobile(isMobileDevice());
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

/** 'sms:+18015550100?&body=...'. The "?&" is the form both iOS and Android accept. */
export function textHref(phone, body) {
  const dial = telHref(phone);
  if (!dial) return '';
  return `sms:${dial.slice(4)}${body ? `?&body=${encodeURIComponent(body)}` : ''}`;
}

export function emailHref(email, subject, body) {
  const to = safeEmail(email);
  if (!to) return '';
  const params = [
    subject ? `subject=${encodeURIComponent(subject)}` : '',
    body ? `body=${encodeURIComponent(body)}` : '',
  ].filter(Boolean).join('&');
  return `mailto:${to}${params ? `?${params}` : ''}`;
}

/**
 * The right link for a prefilled message: a text on a phone, an email on a
 * computer, and whichever of the two the recipient has when only one exists.
 * Returns null when the recipient has neither, so the caller can leave the
 * button out instead of showing one that does nothing.
 */
export function messageLink({ phone, email, subject, body, mobile }) {
  const text = textHref(phone, body);
  const mail = emailHref(email, subject, body);
  if (mobile) {
    if (text) return { href: text, kind: 'text' };
    if (mail) return { href: mail, kind: 'email' };
    return null;
  }
  if (mail) return { href: mail, kind: 'email' };
  if (text) return { href: text, kind: 'text' };
  return null;
}

/** True when a message to this agent can go somewhere: a phone that can be texted or an address that can be written to. */
export const canMessage = (agent) => Boolean(textHref(agent?.phone, 'x') || emailHref(agent?.email, 'x', 'x'));

/** 'the Aspen model', whether the home is called 'Aspen' or 'The Aspen' (not 'the The Aspen model'). */
export const modelPhrase = (homeName) => `the ${String(homeName ?? '').trim().replace(/^the\s+/i, '')} model`;

/**
 * What a buyer's message to an agent says. The buyer's name goes in because an
 * agent reading a text from a number they do not know needs to know who it is.
 */
export function tourMessage({ agentName, community, buyerName, homeName }) {
  const first = String(agentName ?? '').trim().split(/\s+/)[0];
  const who = String(buyerName ?? '').trim();
  const place = String(community ?? '').trim();
  const what = homeName
    ? `tour ${modelPhrase(homeName)}${place ? ` at ${place}` : ''}`
    : `tour the homes${place ? ` at ${place}` : ''}`;
  return `Hi${first ? ` ${first}` : ''},${who ? ` this is ${who}.` : ''} I'd like to ${what}. What times work for you?`;
}

/** The same, for the lender: a conversation about financing rather than a visit. */
export function financingMessage({ lenderName, community, buyerName }) {
  const who = String(buyerName ?? '').trim();
  const place = String(community ?? '').trim();
  return `Hi${lenderName ? ` ${String(lenderName).trim().split(/\s+/)[0]}` : ''},${who ? ` this is ${who}.` : ''} I'd like to talk about financing a home${place ? ` at ${place}` : ''}. What times work for you?`;
}

/**
 * Puts text on the clipboard. True when it worked. Used where a link cannot do the job (a computer
 * has no way to open a text message), so the number is copied and the buyer is told.
 */
export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand('copy');
      field.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
