import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';

import { Dialog } from '../ui.jsx';

export function buyerUrl(communityId) {
  return `${window.location.origin}/c/${communityId}`;
}

export function useQrDataUrl(communityId, cellSize = 6) {
  return useMemo(() => {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(buyerUrl(communityId));
      qr.make();
      return qr.createDataURL(cellSize, 12);
    } catch {
      return '';
    }
  }, [cellSize, communityId]);
}

export default function QrDialog({ community, onClose, onOpenFlyer }) {
  const url = buyerUrl(community.id);
  const dataUrl = useQrDataUrl(community.id);
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
      </p>
    </Dialog>
  );
}
