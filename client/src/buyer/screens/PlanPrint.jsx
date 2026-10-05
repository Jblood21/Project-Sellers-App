import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PLAN_LABELS, TOOL_KEYS } from '@shared/domain.js';
import { longDate, money } from '../../lib/format.js';
import { useBuyer } from '../BuyerContext.jsx';
import CommunityMark from '../CommunityMark.jsx';
import ComplianceFooter from '../ComplianceFooter.jsx';

/**
 * The printable plan. Print CSS hides everything but #plan-doc, so "Save as PDF"
 * in the browser's print dialog produces a clean one-page document.
 */
export default function PlanPrint() {
  const { community, homes, lead } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();

  useEffect(() => {
    document.title = `My Home Plan — ${community?.name ?? ''}`;
    return () => {
      document.title = community?.name ?? 'Homebuyer App';
    };
  }, [community?.name]);

  const savedHomes = (lead?.savedHomeIds ?? []).map((id) => homes.find((h) => h.id === id)).filter(Boolean);
  const items = TOOL_KEYS.filter((key) => lead?.plan?.[key]).map((key) => ({
    key,
    label: PLAN_LABELS[key],
    summary: lead.plan[key],
  }));

  return (
    <div style={{ background: '#f1f1ee', minHeight: '100vh', padding: '20px 16px 60px' }}>
      <div
        className="no-print"
        style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18, flexWrap: 'wrap' }}
      >
        <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => navigate(`/c/${communityId}/plan`)}>
          Close
        </button>
        <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <div
        id="plan-doc"
        style={{
          maxWidth: 720, margin: '0 auto', background: '#fff', color: '#1f221d', borderRadius: 12,
          padding: '32px 34px 28px', boxShadow: '0 2px 14px rgba(0,0,0,.09)',
          fontFamily: "'Manrope', system-ui, sans-serif", lineHeight: 1.55,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            {/* The development's logo when it has one; the name is printed under it either way. */}
            <div style={{ marginBottom: 8 }}>
              <CommunityMark tone="light" height={40} fallback="none" />
            </div>
            <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5f5c52', fontWeight: 700 }}>
              {community?.name} · {community?.location}
            </div>
            <h1 style={{ margin: '6px 0 0', fontSize: 26 }}>My Home Plan</h1>
          </div>
          <div style={{ fontSize: 12.5, color: '#5f5c53', textAlign: 'right' }}>
            <div style={{ fontWeight: 700, color: '#1f221d' }}>{lead?.name}</div>
            <div>{lead?.email}</div>
            <div>{lead?.phone}</div>
            <div>{longDate()}</div>
          </div>
        </div>

        {savedHomes.length ? (
          <div style={{ marginBottom: 22 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5f5c52' }}>
              Homes I Like
            </h2>
            {savedHomes.map((home) => (
              <div
                key={home.id}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid #eae8e0', fontSize: 14 }}
              >
                <span>★ {home.name}</span>
                <span style={{ color: '#5f5c53' }}>{money(home.price)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {items.map((item) => (
          <div key={item.key} style={{ marginBottom: 18 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5f5c52' }}>
              {item.label}
            </h2>
            <p style={{ margin: 0, fontSize: 14 }}>{item.summary}</p>
          </div>
        ))}

        <p style={{ marginTop: 26, fontSize: 11.5, color: '#5f5c52', lineHeight: 1.6 }}>
          Estimates only — not a loan offer, pre-approval or purchase contract. Prepared with the {community?.name}{' '}
          team; contact us anytime to update your plan.
        </p>

        {/*
          Inside the document, not after it: print CSS hides everything outside
          #plan-doc, so a footer mounted beside it would reach the screen and
          never the PDF. The shell leaves the print route's footer to this one.
        */}
        <ComplianceFooter print />
      </div>
    </div>
  );
}
