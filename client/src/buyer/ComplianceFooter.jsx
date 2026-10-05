import { complianceOf, telHref } from '@shared/compliance.js';
import { useBuyer } from './BuyerContext.jsx';
import CommunityMark from './CommunityMark.jsx';
import { layoutTraits } from './layouts/index.js';
import LenderLogo, { EhlMark } from './LenderLogo.jsx';

/**
 * The lender's licensing and disclosures, at the foot of every buyer page.
 *
 * Every word of it comes from `complianceOf(community.settings)`: this file
 * decides the order and the markup and prints what it is given. The same
 * function feeds the plan email and the structured data, so a statement edited
 * in Setup changes in all of them at once and none can drift. Nothing here is
 * collapsed, truncated or hidden behind a tap, and nothing is positioned: it
 * scrolls with the page.
 *
 * The class names are a contract with the layout stylesheets and are not to be
 * renamed. `print` is the printed plan's version: black on white, drawn with the
 * one-colour logo, with the licensing address written out because a link does
 * nothing on paper.
 *
 * With no lender name and NMLS ID the identity block is left out entirely, but
 * the statements still print: an unfinished advertisement should show less, not
 * a half-built one.
 */
export default function ComplianceFooter({ print = false }) {
  const { community, layout } = useBuyer();
  if (!community) return null;

  const c = complianceOf(community.settings, { community, year: new Date().getFullYear() });
  const { lender, lo } = c;
  const dark = !print && layoutTraits(layout).footerTone === 'dark';
  const tone = print ? 'print' : dark ? 'dark' : 'light';
  // The NMLS link is printed inside the licence sentence, so the nav leaves it out.
  const links = c.links.filter((link) => link.key !== 'nmls');
  const phoneHref = telHref(lender.phone);
  // The licence sentence is typed in Setup and may end without a full stop; the
  // sentence that follows it would then run on from it.
  const license = c.license && c.nmlsHref && !/[.!?]$/.test(c.license) ? `${c.license}.` : c.license;

  return (
    <footer
      className={`b-footer b-footer--${dark ? 'dark' : 'light'}${print ? ' b-footer--print' : ''}`}
      aria-label="Lender licensing and disclosures"
    >
      {lender.ready ? (
        <>
          <div className="b-footer__brand">
            {/* On a dark ground the development's own mark leads, then the lender's, never merged into one lockup. */}
            {dark && !print ? <CommunityMark tone="dark" fallback="none" height={40} className="b-footer__mark" /> : null}
            <LenderLogo tone={tone} height={print ? 40 : 44} />
            <EhlMark tone={dark ? 'dark' : 'light'} height={print ? 40 : 44} />
          </div>
          <p className="b-footer__id">
            <strong>{lender.name}</strong> · NMLS #{lender.nmls}
            {lender.address || lender.phone || lender.websiteHref ? <br /> : null}
            {lender.address}
            {lender.address && (lender.phone || lender.websiteHref) ? ' · ' : null}
            {lender.phone ? (
              phoneHref ? <a className="b-footer__tel" href={phoneHref}>{lender.phone}</a> : lender.phone
            ) : null}
            {lender.phone && lender.websiteHref ? ' · ' : null}
            {lender.websiteHref ? (
              <a className="b-footer__tap" href={lender.websiteHref} target="_blank" rel="noopener noreferrer">
                {lender.website}
              </a>
            ) : null}
            {lo ? (
              <>
                <br />
                Loan officer: {lo.name} · NMLS #{lo.nmls}
              </>
            ) : null}
          </p>
        </>
      ) : null}

      {c.license || c.nmlsHref ? (
        <p className="b-footer__fine b-footer__license">
          {license}
          {license && c.nmlsHref ? ' ' : null}
          {c.nmlsHref ? (
            <>
              Verify our licensing at{' '}
              <a className="b-footer__tap" href={c.nmlsHref} target="_blank" rel="noopener noreferrer">NMLS Consumer Access</a>
              {print ? ` (${c.nmlsHref})` : null}.
            </>
          ) : null}
        </p>
      ) : null}

      {c.statements.map((statement) => (
        <p key={statement.key} className="b-footer__fine" data-statement={statement.key}>
          {statement.text}
        </p>
      ))}

      {links.length && !print ? (
        <nav className="b-footer__links" aria-label="Legal">
          {links.map((link) => (
            <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer">
              {link.label}
            </a>
          ))}
        </nav>
      ) : null}

      <p className="b-footer__fine b-footer__copy">{c.copyright}</p>
    </footer>
  );
}

/**
 * The short disclosure that rides inside a sheet holding a tool.
 *
 * A sheet covers the page footer, and the sheet shows a payment, a rate and the
 * cash to close, so the buyer who reached those numbers through it would never
 * see a word of the disclosure that goes with them. This prints the lender's
 * identity, the Equal Housing Lender mark and the three statements that qualify
 * the figures, all from `complianceOf` so an edit in Setup reaches it too.
 */
export function SheetDisclosure() {
  const { community } = useBuyer();
  if (!community) return null;

  const c = complianceOf(community.settings, { community, year: new Date().getFullYear() });
  const { lender } = c;
  const shown = c.statements.filter((statement) => ['notOffer', 'disclaimer', 'rates'].includes(statement.key));
  if (!lender.ready && !shown.length) return null;

  return (
    <aside className="b-sheet-note" aria-label="Estimates and lender disclosure">
      {lender.ready ? (
        <div className="b-sheet-note__brand">
          <EhlMark tone="light" height={40} />
          <p className="b-footer__id">
            <strong>{lender.name}</strong> · NMLS #{lender.nmls}
          </p>
        </div>
      ) : null}
      {shown.map((statement) => (
        <p key={statement.key} className="b-footer__fine" data-statement={statement.key}>
          {statement.text}
        </p>
      ))}
    </aside>
  );
}
