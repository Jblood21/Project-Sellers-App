import { parseFaq } from '@shared/domain.js';
import { useBuyer } from './BuyerContext.jsx';

/**
 * The questions and answers a builder has written, as the community's list.
 * Empty when the switch is off or nothing has been written, so the screen can
 * leave the whole section out.
 */
export function useFaq() {
  const { community, features } = useBuyer();
  return features.faq ? parseFaq(community?.settings?.faqJson) : [];
}

/**
 * Each question opens in place. Native <details>: it works without script, a
 * keyboard opens it with Enter or Space, and a screen reader says whether it is
 * open. Answers are text, with the builder's line breaks kept.
 */
export default function FaqList({ items }) {
  if (!items.length) return null;
  return (
    <div className="b-faq">
      {items.map((item, index) => (
        <details key={`${index}-${item.q}`} className="b-faq__item">
          <summary className="b-faq__q">{item.q}</summary>
          <p className="b-faq__a">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
