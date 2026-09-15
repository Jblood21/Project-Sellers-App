/**
 * The Cornerpost mark: a driven post with its two squared lines running off it.
 * Admin-side only — the buyer app is white-labeled to the community, so the
 * platform name never appears on a screen a homebuyer sees.
 */
export default function Wordmark({ size = 20, showName = true }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M7 21V6l5-3 5 3" />
        <path d="M7 11h13" />
        <path d="M7 16H2" />
      </svg>
      {showName ? (
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            fontSize: size * 0.82,
            letterSpacing: '-0.01em',
          }}
        >
          Cornerpost
        </span>
      ) : null}
    </span>
  );
}
