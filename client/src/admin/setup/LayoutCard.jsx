import { useState } from 'react';

import { LAYOUTS, LISTING_LAYOUT_NOTES, isListing, normalizeLayout } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote } from '../ui.jsx';

/**
 * A rough wireframe of each layout, so the choice is not made from a name alone.
 * Decorative: the name and note beside it carry the meaning.
 */
function Wire({ layoutKey }) {
  if (layoutKey === 'foyer') {
    // Centred serif title over thin rules, then a numbered list: a printed page.
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#f8f4ec" />
        <rect x="8" y="9" width="22" height="3" fill="#6b625a" />
        <rect x="62" y="6" width="36" height="7" fill="#2b2622" />
        <rect x="130" y="9" width="22" height="3" fill="#6b625a" />
        <rect x="8" y="17" width="144" height="1" fill="#cfc6b8" />
        <rect x="46" y="23" width="68" height="3" fill="#a8864b" />
        <rect x="30" y="29" width="100" height="1" fill="#cfc6b8" />
        <g fill="#2b2622">
          <rect x="12" y="36" width="8" height="4" /><rect x="26" y="36" width="70" height="4" />
          <rect x="12" y="47" width="8" height="4" /><rect x="26" y="47" width="58" height="4" />
          <rect x="12" y="58" width="8" height="4" /><rect x="26" y="58" width="66" height="4" />
        </g>
        <g fill="#cfc6b8">
          <rect x="12" y="43" width="136" height="1" /><rect x="12" y="54" width="136" height="1" /><rect x="12" y="65" width="136" height="1" />
        </g>
      </svg>
    );
  }
  if (layoutKey === 'marketplace') {
    // A white search bar, a row of filters, then photo-first listing cards three across.
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#f3f5f7" />
        <rect width="160" height="12" fill="#fff" />
        <rect x="8" y="4" width="24" height="4" fill="#1d2733" />
        <g fill="#5b6675"><rect x="42" y="5" width="12" height="2" /><rect x="58" y="5" width="10" height="2" /><rect x="72" y="5" width="14" height="2" /></g>
        <rect x="124" y="3" width="28" height="6" rx="1.5" fill="#1d4ed8" />
        <g fill="#fff" stroke="#c4ccd6"><rect x="8" y="16" width="26" height="6" rx="1.5" /><rect x="38" y="16" width="20" height="6" rx="1.5" /><rect x="62" y="16" width="24" height="6" rx="1.5" /></g>
        <g fill="#fff" stroke="#d5dbe2">
          <rect x="8" y="27" width="44" height="40" rx="3" /><rect x="58" y="27" width="44" height="40" rx="3" /><rect x="108" y="27" width="44" height="40" rx="3" />
        </g>
        <g fill="#a9c1d9"><rect x="8.5" y="27.5" width="43" height="22" rx="2.5" /><rect x="58.5" y="27.5" width="43" height="22" rx="2.5" /><rect x="108.5" y="27.5" width="43" height="22" rx="2.5" /></g>
        <g fill="#1d2733"><rect x="12" y="53" width="22" height="4" /><rect x="62" y="53" width="22" height="4" /><rect x="112" y="53" width="22" height="4" /></g>
        <g fill="#8794a3"><rect x="12" y="60" width="32" height="2" /><rect x="62" y="60" width="32" height="2" /><rect x="112" y="60" width="32" height="2" /></g>
      </svg>
    );
  }
  if (layoutKey === 'redrock') {
    // A plum bar, a big serif greeting over the plan strip, the dark payment panel with its figure in
    // sandstone, and two warm home cards whose photos round their top-left corner more than the rest.
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#f4eadb" />
        <rect width="160" height="12" fill="#4a2338" />
        <rect x="8" y="3" width="30" height="3.5" fill="#f4eadb" />
        <rect x="8" y="8" width="16" height="1.5" fill="#e8a882" />
        <rect x="136" y="4" width="6" height="4" rx="2" fill="#f4eadb" />
        <g fill="#f4eadb"><rect x="146" y="4" width="7" height="1" /><rect x="146" y="6" width="7" height="1" /><rect x="146" y="8" width="7" height="1" /></g>
        <rect x="8" y="16" width="58" height="5" fill="#2b1a20" />
        <rect x="8" y="23" width="40" height="5" fill="#2b1a20" />
        <rect x="8" y="31" width="15" height="1.5" fill="#a3432a" />
        <rect x="24" y="31" width="9" height="1.5" fill="#e8a882" />
        <rect x="34" y="31" width="32" height="1.5" fill="#e2d2bc" />
        <rect x="8" y="36" width="58" height="29" rx="3" fill="#4a2338" />
        <rect x="12" y="40" width="18" height="1.5" fill="#e8a882" />
        <rect x="12" y="44" width="34" height="9" fill="#e8a882" />
        <rect x="12" y="57" width="44" height="1.5" fill="#f0d9bc" />
        <rect x="12" y="60.5" width="30" height="1.5" fill="#f0d9bc" />
        <g stroke="#e2d2bc" strokeWidth="0.75">
          <path d="M78 16H107Q110 16 110 19V62Q110 65 107 65H75Q72 65 72 62V22Q72 16 78 16Z" fill="#fbf6ee" />
          <path d="M120 16H149Q152 16 152 19V62Q152 65 149 65H117Q114 65 114 62V22Q114 16 120 16Z" fill="#fbf6ee" />
        </g>
        <path d="M78 16H107Q110 16 110 19V36H72V22Q72 16 78 16Z" fill="#e8c4a4" />
        <path d="M120 16H149Q152 16 152 19V36H114V22Q114 16 120 16Z" fill="#e8c4a4" />
        <g fill="#b8613f"><rect x="72" y="29" width="38" height="7" /><rect x="114" y="29" width="38" height="7" /></g>
        <g fill="#2b1a20"><rect x="76" y="40" width="17" height="4" /><rect x="118" y="40" width="17" height="4" /></g>
        <g fill="#9a3e26"><rect x="95" y="41" width="10" height="2.5" /><rect x="137" y="41" width="10" height="2.5" /></g>
        <g fill="#6b5449"><rect x="76" y="48" width="26" height="1.5" /><rect x="118" y="48" width="26" height="1.5" /></g>
        <g fill="#f0d9bc"><rect x="76" y="53" width="13" height="4" rx="2" /><rect x="118" y="53" width="13" height="4" rx="2" /></g>
      </svg>
    );
  }
  if (layoutKey === 'trailhead') {
    // A wavy dark green bar, the trail's ticked and numbered stops down a narrow column, the current stop opened beside it.
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#f8f5ed" />
        <path d="M0 0H160V12C150 14 140 11 128 13C116 15 104 11 92 13C80 15 68 11 56 13C44 15 32 11 20 13C12 14 6 12 0 13Z" fill="#1f4d3a" />
        <rect x="8" y="4" width="26" height="3.5" fill="#ffffff" />
        <rect x="138" y="4" width="5" height="4" rx="2" fill="#ffffff" />
        <g fill="#ffffff"><rect x="147" y="4" width="6" height="1" /><rect x="147" y="6" width="6" height="1" /><rect x="147" y="8" width="6" height="1" /></g>
        <rect x="8" y="17" width="12" height="1.5" fill="#826d40" />
        <rect x="8" y="19.5" width="20" height="4" fill="#26352e" />
        <rect x="8" y="25" width="32" height="1.5" fill="#26352e" />
        <rect x="8" y="28" width="48" height="1" fill="#d9d6cc" />
        <rect x="8" y="28" width="16" height="1" fill="#1f4d3a" />
        <path d="M12 33C10 34 14 35 12 36C9 38.5 15 39.5 12 42C9 44.5 15 45.5 12 48" fill="none" stroke="#1f4d3a" strokeWidth="1" />
        <path d="M12 48C9 50.5 15 51.5 12 54C9 56.5 15 57.5 12 60C9 62.5 15 63.5 12 66" fill="none" stroke="#1f4d3a" strokeWidth="1" strokeDasharray="0.1 2" strokeLinecap="round" />
        <rect x="11.6" y="30" width="0.8" height="4" fill="#1f4d3a" />
        <path d="M12.4 30L15.5 31.1L12.4 32.2Z" fill="#d8b56a" />
        <rect x="6.5" y="44.5" width="50" height="7" rx="2" fill="#ffffff" stroke="#e3dfd4" strokeWidth="0.5" />
        <g fill="#d8b56a"><circle cx="12" cy="36" r="2.2" /><circle cx="12" cy="42" r="2.2" /></g>
        <circle cx="12" cy="48" r="2.5" fill="#1f4d3a" stroke="#ffffff" strokeWidth="0.7" />
        <g fill="#ffffff" stroke="#69726b" strokeWidth="0.6"><circle cx="12" cy="54" r="2" /><circle cx="12" cy="60" r="2" /><circle cx="12" cy="66" r="2" /></g>
        <g fill="#26352e"><rect x="18" y="35.2" width="26" height="1.6" /><rect x="18" y="41.2" width="22" height="1.6" /><rect x="18" y="47.2" width="28" height="1.6" /></g>
        <g fill="#69726b"><rect x="18" y="53.2" width="24" height="1.6" /><rect x="18" y="59.2" width="20" height="1.6" /><rect x="18" y="65.2" width="22" height="1.6" /></g>
        <rect x="66" y="18" width="86" height="32" rx="3" fill="#ffffff" stroke="#e3dfd4" strokeWidth="0.5" />
        <rect x="71" y="22" width="20" height="1.5" fill="#826d40" />
        <rect x="71" y="26" width="46" height="5" fill="#26352e" />
        <rect x="71" y="33" width="36" height="1.5" fill="#69726b" />
        <rect x="71" y="39" width="24" height="7" rx="2" fill="#1f4d3a" />
        <rect x="98" y="39" width="28" height="7" rx="2" fill="#ffffff" stroke="#1f4d3a" strokeWidth="0.75" />
        <rect x="66" y="54" width="86" height="12" rx="3" fill="#ffffff" stroke="#e3dfd4" strokeWidth="0.5" />
        <circle cx="73" cy="60" r="2.4" fill="#ffffff" stroke="#69726b" strokeWidth="0.6" />
        <rect x="79" y="57.5" width="14" height="1.5" fill="#826d40" />
        <rect x="79" y="61" width="30" height="2" fill="#26352e" />
      </svg>
    );
  }
  if (layoutKey === 'showcase') {
    // A dark slim bar, thin ticks over a photo the width of the screen, the home's name large on its dark lower edge with the price and an orange pill, and a pill tab bar floating at the foot.
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#111111" />
        <rect x="8" y="3" width="24" height="3.5" fill="#f5f5f5" />
        <rect x="132" y="2" width="20" height="5.5" rx="2.75" fill="#f97316" />
        <rect x="8" y="11" width="46" height="1" fill="#f5f5f5" />
        <g fill="#4a4a4a"><rect x="57" y="11" width="46" height="1" /><rect x="106" y="11" width="46" height="1" /></g>
        <rect y="14" width="160" height="26" fill="#e58a57" />
        <rect y="14" width="160" height="8" fill="#d9774e" />
        <circle cx="124" cy="25" r="6" fill="#fde3a6" />
        <path d="M0 35 40 30 80 34 120 28 160 33V40H0Z" fill="#a9624f" />
        <path d="M60 40V29L71 21 82 29V40Z" fill="#f3e3cc" />
        <rect x="68" y="32" width="6" height="8" fill="#7a4a2e" />
        <rect x="8" y="43" width="52" height="8" fill="#ffffff" />
        <rect x="8" y="54" width="22" height="3" fill="#e5e5e5" />
        <rect x="33" y="54" width="20" height="3" fill="#fb923c" />
        <rect x="108" y="45" width="44" height="8" rx="4" fill="#f97316" />
        <rect x="30" y="61" width="100" height="8" rx="4" fill="#1c1c1c" stroke="#3a3a3a" strokeWidth="0.75" />
        <rect x="38" y="64" width="14" height="2" fill="#fb923c" />
        <g fill="#9a9a9a"><rect x="62" y="64" width="16" height="2" /><rect x="88" y="64" width="12" height="2" /><rect x="110" y="64" width="12" height="2" /></g>
      </svg>
    );
  }
  if (layoutKey === 'ledger') {
    // A dark rail down the left beside a light bar, then a bento of tiles: buying power on the dark tile with its cyan gauge and the homes it reaches filled, the payment with its five-part bar, a ring, the plan's dots, the rates, the homes in rows, Start and the help.
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#f1f5f9" />
        <rect width="12" height="72" fill="#0f172a" />
        <rect x="2" y="3" width="8" height="7" rx="1.5" fill="#06b6d4" />
        <g fill="#cbd5e1"><rect x="3" y="14" width="6" height="3" /><rect x="3" y="21" width="6" height="3" /><rect x="3" y="28" width="6" height="3" /><rect x="3" y="35" width="6" height="3" /></g>
        <rect x="17" y="3" width="20" height="1.5" fill="#69707d" />
        <rect x="17" y="6" width="30" height="3.5" fill="#0f172a" />
        <rect x="112" y="3" width="8" height="6" rx="1" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.5" />
        <rect x="122" y="3" width="14" height="6" rx="1" fill="#ffffff" stroke="#0f172a" strokeWidth="0.5" />
        <rect x="138" y="3" width="15" height="6" rx="1" fill="#06b6d4" />
        <rect x="17" y="13" width="67" height="22" rx="2" fill="#0f172a" />
        <rect x="21" y="16" width="14" height="1.5" fill="#cbd5e1" />
        <rect x="21" y="20" width="22" height="4" fill="#ffffff" />
        <path d="M65 31A8 8 0 0 1 81 31" fill="none" stroke="#334155" strokeWidth="2.5" />
        <path d="M65 31A8 8 0 0 1 70 23.6" fill="none" stroke="#06b6d4" strokeWidth="2.5" />
        <g fill="#06b6d4"><rect x="21" y="27.5" width="12" height="5" rx="1" /><rect x="35" y="27.5" width="12" height="5" rx="1" /></g>
        <rect x="49" y="27.5" width="12" height="5" rx="1" fill="none" stroke="#64748b" strokeWidth="0.5" />
        <rect x="86" y="13" width="67" height="22" rx="2" fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.5" />
        <rect x="90" y="16" width="16" height="1.5" fill="#0f172a" />
        <rect x="90" y="19.5" width="18" height="4" fill="#0f172a" />
        <rect x="90" y="26" width="44" height="2" fill="#06b6d4" />
        <rect x="134.5" y="26" width="5" height="2" fill="#0f172a" />
        <rect x="140" y="26" width="4" height="2" fill="#83dbea" />
        <rect x="144.5" y="26" width="3" height="2" fill="#69707d" />
        <rect x="148" y="26" width="1.5" height="2" fill="#eeeff0" stroke="#94a3b8" strokeWidth="0.3" />
        <g fill="#69707d"><rect x="90" y="30.5" width="24" height="1.2" /><rect x="118" y="30.5" width="24" height="1.2" /></g>
        <g fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.5"><rect x="17" y="37" width="32.5" height="15" rx="2" /><rect x="51.5" y="37" width="32.5" height="15" rx="2" /><rect x="86" y="37" width="67" height="15" rx="2" /></g>
        <circle cx="25" cy="45" r="3.5" fill="none" stroke="#e2e8f0" strokeWidth="1.5" />
        <path d="M25 41.5A3.5 3.5 0 1 1 21.7 46.2" fill="none" stroke="#047a8e" strokeWidth="1.5" />
        <g fill="#0f172a"><rect x="31" y="42.5" width="12" height="2.5" /><rect x="55" y="40" width="14" height="3" /></g>
        <rect x="31" y="46.5" width="10" height="1.2" fill="#69707d" />
        <g fill="#047a8e"><circle cx="56.5" cy="47.5" r="1.3" /><circle cx="60" cy="47.5" r="1.3" /></g>
        <g fill="none" stroke="#69707d" strokeWidth="0.5"><circle cx="63.5" cy="47.5" r="1.1" /><circle cx="67" cy="47.5" r="1.1" /><circle cx="70.5" cy="47.5" r="1.1" /></g>
        <rect x="90" y="40" width="16" height="1.5" fill="#0f172a" />
        <g fill="#0f172a"><rect x="90" y="45" width="14" height="3" /><rect x="112" y="45" width="14" height="3" /><rect x="134" y="45" width="14" height="3" /></g>
        <g fill="#e2e8f0"><rect x="109" y="44" width="0.5" height="5" /><rect x="131" y="44" width="0.5" height="5" /></g>
        <g fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.5"><rect x="17" y="54" width="67" height="15" rx="2" /><rect x="86" y="54" width="32.5" height="15" rx="2" /><rect x="120.5" y="54" width="32.5" height="15" rx="2" /></g>
        <g fill="#9fc9a0"><rect x="20" y="56.5" width="6" height="4.5" rx="0.5" /><rect x="20" y="62.5" width="6" height="4.5" rx="0.5" /></g>
        <g fill="#0f172a"><rect x="28" y="57.5" width="14" height="1.5" /><rect x="28" y="63.5" width="12" height="1.5" /><rect x="66" y="57.5" width="14" height="1.5" /><rect x="66" y="63.5" width="14" height="1.5" /></g>
        <rect x="70" y="59.8" width="10" height="1.5" rx="0.5" fill="#bfe9f1" />
        <rect x="90" y="56.5" width="18" height="2" fill="#0f172a" />
        <rect x="90" y="62" width="24.5" height="5" rx="1" fill="#06b6d4" />
        <rect x="124.5" y="56.5" width="16" height="1.5" fill="#0f172a" />
        <rect x="124.5" y="60" width="18" height="3.5" fill="#0f172a" />
        <rect x="124.5" y="65" width="22" height="1.2" fill="#69707d" />
      </svg>
    );
  }
  if (layoutKey === 'saltgrass') {
    return (
      <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
        <rect width="160" height="72" fill="#f4f6f8" />
        <rect width="160" height="14" fill="#17202e" />
        <rect y="14" width="160" height="2" fill="#c9a227" />
        <rect x="10" y="24" width="86" height="8" fill="#17202e" />
        <rect x="10" y="35" width="52" height="8" fill="#17202e" />
        <rect x="10" y="50" width="62" height="14" rx="2" fill="#c9a227" />
        <rect x="104" y="24" width="46" height="40" rx="2" fill="#fff" stroke="#17202e" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg className="ax-wire" viewBox="0 0 160 72" aria-hidden="true" focusable="false">
      <rect width="160" height="72" fill="#f6f4ee" />
      <rect width="160" height="12" fill="#fff" />
      <rect x="112" y="3" width="42" height="6" rx="3" fill="#4e7758" />
      <rect x="10" y="18" width="62" height="22" rx="8" fill="#e9efe9" />
      <rect x="78" y="18" width="72" height="22" rx="8" fill="#fff" stroke="#d7d4c9" />
      <rect x="10" y="46" width="62" height="20" rx="8" fill="#fff" stroke="#d7d4c9" />
      <rect x="78" y="46" width="72" height="20" rx="8" fill="#fff" stroke="#d7d4c9" />
    </svg>
  );
}

/**
 * Picks the buyer app's layout: type, shape and where things sit. Colour is the
 * theme's job and tool behaviour is nobody's, so this saves at once the way the
 * theme picker does, and nothing about it waits on the Save settings button.
 */
export default function LayoutCard({ community, reload }) {
  const { token } = useAdmin();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const current = normalizeLayout(community.layout);

  const choose = async (layout) => {
    if (layout === current || saving) return;
    setError('');
    setSaving(layout);
    try {
      await adminApi.updateCommunity(token, community.id, { layout });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="card elev-sm" style={{ gap: 10 }}>
      <span className="card-kicker">Buyer app layout</span>
      <div className="ax-choices">
        {LAYOUTS.map((layout) => (
          <button
            key={layout.k}
            type="button"
            className="ax-choice"
            aria-pressed={current === layout.k}
            disabled={Boolean(saving)}
            onClick={() => choose(layout.k)}
          >
            <Wire layoutKey={layout.k} />
            <span className="ax-choice-head">
              <span className="ax-choice-name">{layout.name}</span>
              {current === layout.k ? <span className="tag tag-accent">In use</span> : null}
              {saving === layout.k ? <span className="text-muted" style={{ fontSize: 14 }}>Saving…</span> : null}
            </span>
            <span className="ax-choice-note">{(isListing(community) && LISTING_LAYOUT_NOTES[layout.k]) || layout.note}</span>
          </button>
        ))}
      </div>
      <span className="text-muted" style={{ fontSize: 14 }}>
        Changes the type, the shapes and where buttons sit, instantly. Every tool does exactly
        what it did before, and the theme below still sets the colours.
      </span>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
