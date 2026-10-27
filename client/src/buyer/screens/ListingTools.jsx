import { Link, useNavigate, useParams } from 'react-router-dom';

import { TOOLS } from '@shared/domain.js';
import { complianceOf } from '@shared/compliance.js';
import { useBuyer } from '../BuyerContext.jsx';
import { canTalkFinancing } from '../reach.js';

/**
 * The Payment tools page of a listing. A community's tools home is built around many homes and a community
 * (Explore Homes, a trail of stops, the dashboard), none of which a buyer of one house has, so a listing gets
 * this plain page instead: the tools the agent turned on, each with its question, the way back to the home, and
 * the lender. It is the same tools underneath (tool/:toolKey), so nothing a tool does is different.
 */
export default function ListingTools({ onOpenLender }) {
  const { community, lead, track, features } = useBuyer();
  const navigate = useNavigate();
  const { communityId } = useParams();
  const base = `/c/${communityId}`;
  const enabled = TOOLS.filter((tool) => community?.tools?.[tool.k]);
  const financing = canTalkFinancing(community, features);

  return (
    <div className="b-shell b-ls-tools" style={{ paddingTop: 20 }}>
      <h1 className="b-head" style={{ margin: '0 0 4px', fontSize: 25 }}>Payment tools</h1>
      <p style={{ margin: '0 0 16px', color: 'var(--t-mut)', fontSize: 13, lineHeight: 1.5 }}>
        See what {community?.name} would cost you each month, and what fits your budget.
      </p>

      {enabled.length ? (
        <ul className="b-ls-tools__list">
          {enabled.map((tool) => (
            <li key={tool.k}>
              <button
                type="button"
                className="b-ls-tools__card"
                onClick={() => navigate(`${base}/tool/${tool.k}`, { state: { from: `${base}/tools` } })}
              >
                {lead?.plan?.[tool.k] ? <span className="b-ls-tools__done">✓ Done</span> : null}
                <span className="b-head b-ls-tools__name">{tool.name}</span>
                <span className="b-ls-tools__q">{tool.q}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: 'var(--t-mut)', fontSize: 13.5 }}>Your agent hasn&apos;t turned on any payment tools for this home.</p>
      )}

      <div className="b-stack" style={{ gap: 10, marginTop: 18 }}>
        {financing ? (
          <button
            type="button"
            className="b-btn b-btn-outline"
            style={{ minHeight: 50 }}
            onClick={() => {
              track(`Tapped ${complianceOf(community?.settings, { community }).lender.name || 'the lender'}`);
              onOpenLender?.();
            }}
          >
            Talk about financing
          </button>
        ) : null}
        <Link to={`${base}/home`} className="b-btn b-btn-outline" style={{ minHeight: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
          Back to the home
        </Link>
      </div>
    </div>
  );
}
