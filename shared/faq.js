/**
 * The FAQ a community shows on its home screen.
 *
 * It is stored as one JSON string in a setting (`faqJson`) so it rides the same
 * save, defaults and public payload as everything else a builder edits in Setup,
 * and read through here so the server that stores it, the editor that writes it
 * and the screen that shows it all agree on its shape. Questions and answers are
 * plain text: they are rendered as text, never as markup.
 */

export const FAQ_MAX_ITEMS = 20;
export const FAQ_QUESTION_MAX = 200;
export const FAQ_ANSWER_MAX = 1500;
/** Room for every item at its longest, plus the JSON around them. */
export const FAQ_JSON_MAX = FAQ_MAX_ITEMS * (FAQ_QUESTION_MAX + FAQ_ANSWER_MAX + 40);

/**
 * The questions a new community starts with. They describe what this app does and
 * promise nothing about a price, a rate or an approval, and they name no lender or
 * agent, so they stay true for any community. A builder edits, reorders or removes
 * them in Setup, and "Restore the starter questions" puts these back.
 */
export const DEFAULT_FAQ = [
  {
    q: 'What can I do in this app?',
    a: 'You can browse the available floorplans, see how the community is laid out, estimate a monthly payment, compare loan options and see what it takes to move in. Anything you save goes into My Home Plan, so it’s all in one place when you’re ready to talk to the team.',
  },
  {
    q: 'Does using the app commit me to anything?',
    a: 'No. Browsing, saving homes and estimating payments don’t commit you to anything. Take a few minutes to find out what works for you.',
  },
  {
    q: 'How do I tour a home?',
    a: 'Open any home and scroll down to the agents. You can call, text or email one of them to set up a tour. The agents are on the home screen too.',
  },
  {
    q: 'Can I change a time I booked?',
    a: 'Yes. Open Set up a time to talk, then pick a different day and time and your booking moves. To cancel, call or text the team.',
  },
  {
    q: 'What is My Home Plan?',
    a: 'It’s everything you’ve saved: the homes you like, your payment estimates and the plan you’ve built. Saving a home also lets the team know you’re interested, so they can help with what matters to you.',
  },
  {
    q: 'Is the payment estimate a quote?',
    a: 'No. It is an estimate to help you plan, based on the price, down payment and rate shown, and it may not include every cost of owning a home. Your actual payment depends on your loan, which is confirmed when you complete a loan application.',
  },
  {
    q: 'How much do I need for a down payment?',
    a: 'It depends on the home and the loan program. See My Payment shows what different down payment amounts mean for your monthly payment, Compare My Options puts two loan programs side by side, and Down Payment Help checks whether you might qualify for assistance. The lender can tell you which programs you may qualify for.',
  },
  {
    q: 'How do I find out what loan I qualify for?',
    a: 'Complete a loan application with the preferred lender. This app is not a loan approval or an offer to lend. The application is how you find out what programs you qualify for and get accurate rate quotes for your specific situation.',
  },
];

const clean = (value, max) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

/**
 * The usable items in a list. An entry whose question or answer is not text is
 * dropped, not coerced: `{x: 1}` printed as "[object Object]" in front of a buyer is
 * worse than a missing row.
 */
function cleanItems(list) {
  const items = [];
  if (!Array.isArray(list)) return items;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || typeof entry.q !== 'string' || typeof entry.a !== 'string') continue;
    const q = clean(entry.q, FAQ_QUESTION_MAX);
    const a = clean(entry.a, FAQ_ANSWER_MAX);
    // A question with no answer, or the reverse, is a half-finished edit.
    if (q && a) items.push({ q, a });
    if (items.length >= FAQ_MAX_ITEMS) break;
  }
  return items;
}

/**
 * The items in a stored value, in order, with anything unusable dropped. Never
 * throws: a hand-edited or truncated value is an FAQ with fewer items, not a
 * broken home screen.
 */
export function parseFaq(raw) {
  try {
    return cleanItems(JSON.parse(String(raw ?? '') || '[]'));
  } catch {
    return [];
  }
}

/** The string to store for a list of items. */
export function serializeFaq(items) {
  return JSON.stringify(cleanItems(items));
}

/**
 * What the server stores for a submitted value: the same string, normalised, or
 * null when it is not a list at all (so a bad request is refused instead of
 * quietly emptying the FAQ). A value nested so deeply that it cannot be read is
 * refused too, rather than crashing the request.
 */
export function normalizeFaqJson(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '[]';
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? serializeFaq(parsed) : null;
  } catch {
    return null;
  }
}

/** What a new community stores until its builder edits the list. */
export const DEFAULT_FAQ_JSON = serializeFaq(DEFAULT_FAQ);

/**
 * Earlier versions of the starter questions, exactly as they were stored. A community that never
 * edited its FAQ still holds one of these; when the starter questions are reworded it is moved to
 * the current text (see REPLACED_DEFAULTS in domain.js), and one a builder has changed is left alone.
 */
export const PREVIOUS_DEFAULT_FAQ_JSONS = [
  "[{\"q\":\"What can I do in this app?\",\"a\":\"Browse the available floorplans, view the community layout, estimate a monthly payment, compare loan options and see what moving in will take. Anything you save goes into My Home Plan, so it is all in one place when you are ready to talk to the team.\"},{\"q\":\"Does using the app commit me to anything?\",\"a\":\"No. Browsing, saving homes and estimating payments do not commit you to anything. Take a few minutes to find out what works for you.\"},{\"q\":\"How do I tour a home?\",\"a\":\"Tap Tour this model on any floorplan to pick a day, then a time that suits you. You can also use Schedule your tour on the home screen to call, text or email an agent directly.\"},{\"q\":\"Can I change a time I booked?\",\"a\":\"Yes. Open Set up a time to talk, then pick a different day and time and your booking moves. To cancel, call or text the team.\"},{\"q\":\"What is My Home Plan?\",\"a\":\"It is everything you have saved: the homes you like, your payment estimates and the plan you have built. Saving a home also lets the team know you are interested, so they can help with what matters to you.\"},{\"q\":\"Is the payment estimate a quote?\",\"a\":\"No. It is an estimate to help you plan, based on the price, down payment and rate shown, and it may not include every cost of owning a home. Your actual payment depends on your loan, which is confirmed when you complete a loan application.\"},{\"q\":\"How much do I need for a down payment?\",\"a\":\"It depends on the home and the loan program. Down Payment Help shows what different amounts mean for your payment, and Which loan option fits me best? compares programs side by side. The lender can tell you which programs you may qualify for.\"},{\"q\":\"How do I find out what loan I qualify for?\",\"a\":\"Complete a loan application with the preferred lender. This app is not a loan approval or an offer to lend. The application is how you find out what programs you qualify for and get accurate rate quotes for your specific situation.\"}]",
];
