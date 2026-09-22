import { HIGHLIGHT_CATEGORIES } from '@shared/domain.js';
import Photo from '../../components/Photo.jsx';
import { useBuyer } from '../BuyerContext.jsx';

/**
 * "What's around here" — the builder's answers to the questions buyers ask on
 * every walk-through, grouped so somebody can skim to the part they care about.
 */
export default function Area() {
  const { community } = useBuyer();
  const highlights = community?.highlights ?? [];

  const grouped = HIGHLIGHT_CATEGORIES
    .map((category) => [category, highlights.filter((h) => h.category === category.k)])
    .filter(([, items]) => items.length);

  return (
    <div className="b-shell" style={{ paddingTop: 20 }}>
      <h2 className="b-head" style={{ margin: '0 0 4px', fontSize: 25 }}>Local Spots</h2>
      <p style={{ margin: '0 0 18px', color: 'var(--t-mut)', fontSize: 13, lineHeight: 1.5 }}>
        {highlights.length
          ? `The schools, parks and everyday places near ${community?.name}.`
          : 'Nothing has been added yet — ask the team what’s nearby.'}
      </p>

      {grouped.map(([category, items]) => (
        <section key={category.k} style={{ marginBottom: 22 }}>
          <span className="b-lbl" style={{ display: 'block', marginBottom: 10 }}>{category.label}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((highlight) => (
              <article
                key={highlight.id}
                style={{
                  background: 'var(--t-sur)', border: '1px solid var(--t-line)',
                  borderRadius: 'var(--t-radlg)', overflow: 'hidden',
                }}
              >
                {highlight.photo ? (
                  <div style={{ height: 150 }}>
                    <Photo photo={highlight.photo} label="" alt={highlight.name} />
                  </div>
                ) : null}
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <span className="b-head" style={{ fontSize: 16, lineHeight: 1.25 }}>{highlight.name}</span>
                    {highlight.detail ? (
                      <span
                        style={{
                          flex: 'none', fontSize: 11, fontWeight: 700, padding: '4px 10px',
                          borderRadius: 999, background: 'var(--t-tint)', color: 'var(--t-accT)',
                        }}
                      >
                        {highlight.detail}
                      </span>
                    ) : null}
                  </div>
                  {highlight.description ? (
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--t-mut)' }}>
                      {highlight.description}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
