import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';

import { Dialog } from '../ui.jsx';

/**
 * The link a buyer is given. Written with the site's one public address when the server has one pinned
 * (PUBLIC_ORIGIN), so a link shared from the old Render address still carries the real domain; and with
 * the community's clean name when it has one, not the id with its random letters. The id still works.
 */
export function buyerUrl(community) {
  return `${community.siteOrigin || window.location.origin}/c/${community.urlKey || community.id}`;
}

export function useQrDataUrl(community, cellSize = 6) {
  const url = buyerUrl(community);
  return useMemo(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      return qr.createDataURL(cellSize, 12);
    } catch {
      return '';
    }
  }, [cellSize, url]);
}

export default function QrDialog({ community, onClose, onOpenFlyer }) {
  const url = buyerUrl(community);
  const dataUrl = useQrDataUrl(community);
  // Opened on a Render address with no public address pinned: the link above is that Render address.
  const onRenderAddress = !community.siteOrigin && /\.onrender\.com$/i.test(window.location.hostname);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <Dialog
      title={`${community.name} — buyer link`}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
          <button type="button" className="btn btn-primary" onClick={onOpenFlyer}>Sign</button>
        </>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
        {dataUrl ? (
          <img
            src={dataUrl} alt={`QR code for ${community.name}`} width={180} height={180}
            style={{ display: 'block', imageRendering: 'pixelated', borderRadius: 8 }}
          />
        ) : null}
      </div>
      <span style={{ fontSize: 12.5, textAlign: 'center', wordBreak: 'break-all' }}>{url}</span>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0, textAlign: 'center' }}>
        Unique to this community. Buyers scan it on site and land in the {community.name} app.
        A code printed from an older link keeps working.
      </p>
      {onRenderAddress ? (
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0, textAlign: 'center' }}>
          This link uses the address you opened the admin on. To have every link use your own domain, set
          PUBLIC_ORIGIN (for example https://touradoor.com) in Render, or open the admin on that domain.
        </p>
      ) : null}
    </Dialog>
  );
}
