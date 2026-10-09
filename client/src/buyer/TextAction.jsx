import { copyText, textHref, useIsMobile } from '../lib/contact.js';
import { useBuyer } from './BuyerContext.jsx';

/**
 * "Text": a link that opens a text message on a phone. A computer cannot send one (an sms: link does
 * nothing on most), so there it copies the number and says so, and a button that looks dead is never
 * shown. Renders nothing when there is no number to text.
 */
export default function TextAction({ phone, message, className, children = 'Text', onAct, style }) {
  const mobile = useIsMobile();
  const { showToast } = useBuyer();
  const href = textHref(phone, message);
  if (!href) return null;

  if (mobile) {
    return <a className={className} style={style} href={href} onClick={() => onAct?.('text')}>{children}</a>;
  }
  const copy = async () => {
    onAct?.('text');
    const ok = await copyText(String(phone).trim());
    showToast(ok ? 'Number copied. Open your phone to text it.' : `Text ${String(phone).trim()} from your phone.`);
  };
  return <button type="button" className={className} style={style} onClick={copy}>{children}</button>;
}
