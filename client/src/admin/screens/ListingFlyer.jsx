import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import qrcode from 'qrcode-generator';

import { complianceOf, safeHref, telHref } from '@shared/compliance.js';
import { agentLicenseLine, calcPayment, money } from '@shared/domain.js';
import { readOpenHouses } from '@shared/listing.js';
import { ChevronLeft } from '../../components/Icons.jsx';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { localToday, sessionDate, sessionTimes } from '../listing.js';
import ImageSlot from '../setup/ImageSlot.jsx';
import LenderPicker from '../setup/LenderPicker.jsx';
import { logoToDataUrl } from '../setup/readImage.js';
import { SaveNote, TextField, useSaving } from '../ui.jsx';
import { LENDER_FIELDS } from '../lenderFields.js';
import { buyerUrl, useQrDataUrl } from './QrDialog.jsx';
import '../../styles/listing-flyer.css';


/** What the back says in small print when the agent has not set the lender's own wording in Setup. */
const FALLBACK_FINE_PRINT =
  'Equal Housing Opportunity. Payment figures are estimates for illustration only. They are not a loan offer, '
  + 'a pre-approval or a commitment to lend. Rates, terms and availability change and depend on your credit, '
  + 'your down payment and the loan you choose. Ask the lender for a quote based on your situation.';

function qrOf(url, cell = 6) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createDataURL(cell, 8);
  } catch {
    return '';
  }
}

/** How the payment on the back is worked out: the tool's own sum at three common ways to buy. */
function scenarios(price, settings) {
  if (!(Number(price) > 0)) return [];
  return [
    { label: 'FHA', note: '3.5% down', program: 'fha', downPct: 3.5 },
    { label: 'Conventional', note: '5% down', program: 'conv', downPct: 5 },
    { label: 'Conventional', note: '20% down', program: 'conv', downPct: 20 },
  ].map((s) => ({ ...s, ...calcPayment({ price, program: s.program, downPct: s.downPct, settings }) }));
}

/** The two-sided printable flyer for a listing: the home and its agent on the front, financing and the lender on the back. */
export default function ListingFlyer({ community, reload }) {
  const navigate = useNavigate();
  const { communityId } = useParams();
  const { token } = useAdmin();
  const saver = useSaving();
  const settings = community.settings ?? {};
  const home = community.homes?.[0] ?? null;
  const agent = community.agents?.[0] ?? null;
  const qr = useQrDataUrl(community, 8);
  const applyHref = safeHref(settings.loanApplicationUrl);
  const applyQr = useMemo(() => (applyHref ? qrOf(applyHref) : ''), [applyHref]);

  const [lender, setLender] = useState(() => Object.fromEntries(LENDER_FIELDS.map(({ key }) => [key, settings[key] ?? ''])));
  const saved = useRef(lender);
  const dirty = LENDER_FIELDS.some(({ key }) => (lender[key] ?? '') !== (saved.current[key] ?? ''));
  const saveLender = () => saver.run(async () => {
    await adminApi.updateCommunity(token, community.id, { settings: lender });
    saved.current = lender;
    await reload?.();
  });
  const uploadLogo = async (dataUrl) => {
    await adminApi.addCommunityPhoto(token, community.id, 'lenderlogo', { dataUrl });
    await reload?.();
  };
  const removeLogo = async () => {
    await adminApi.deletePhoto(token, community.lenderLogo.id);
    await reload?.();
  };

  // The page is fixed at a letter sheet; on a smaller screen it is shown scaled down to fit, and prints at full size.
  const stage = useRef(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const fit = () => {
      const width = stage.current?.clientWidth || 816;
      setZoom(Math.min(1, width / 816));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Typed values show on the sheet as they are typed, so the agent sees what will print before saving.
  const shown = { ...settings, ...lender };
  const c = complianceOf(shown, { community });
  const hasLender = Boolean(c.lender.name);
  const fine = c.statements.find((s) => s.key === 'disclaimer')?.text || FALLBACK_FINE_PRINT;
  const photos = [community.heroPhoto, ...(home?.photos ?? [])].filter((p) => p?.url);
  const [lead, ...rest] = photos;
  const sessions = readOpenHouses(settings.openHousesJson).filter((s) => s.date >= localToday()).slice(0, 3);
  const price = home?.price || 0;
  const rows = scenarios(price, settings);
  const facts = [
    home?.beds ? `${home.beds} bed` : '',
    home?.baths ? `${home.baths} bath` : '',
    home?.sqft ? `${home.sqft.toLocaleString('en-US')} sq ft` : '',
  ].filter(Boolean);
  const license = agentLicenseLine(agent);
  const agentPhone = agent?.phone ?? '';

  return (
    <div className="a-shell fl-shell">
      <div className="no-print fl-bar">
        <button
          type="button" className="btn btn-secondary btn-icon" aria-label="Back"
          onClick={() => navigate(`/admin/communities/${communityId}`)}
        >
          <ChevronLeft size={18} />
        </button>
        <h3 style={{ margin: 0, fontSize: 20, flex: 1 }}>Printable flyer</h3>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </div>
      <p className="text-muted no-print" style={{ fontSize: 14, lineHeight: 1.5, margin: '0 0 14px' }}>
        Two sides on letter paper: the home and you on the front, financing and your lender on the back. Print double-sided
        (flip on the long edge) or save as PDF from the print window. Turn off &ldquo;Headers and footers&rdquo; for a clean page.
      </p>

      <div className="card elev-sm no-print fl-lender" style={{ gap: 12, marginBottom: 18 }}>
        <span className="card-kicker">Lender on the back</span>
        <p className="text-muted" style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
          Fill in the lender you work with. It prints on the back and also fills the &ldquo;Talk about financing&rdquo; button on the
          buyer page. Leave it empty and the back points buyers to you for financing instead.
        </p>
        <LenderPicker
          community={community} fields={lender} reload={reload}
          onUsed={(picked) => {
            const next = { ...lender, ...picked };
            setLender(next);
            saved.current = next;
          }}
        />
        <div className="ax-cols">
          {LENDER_FIELDS.map(({ key, label, ...rest2 }) => (
            <TextField
              key={key} label={label} value={lender[key]} maxLength={200}
              onChange={(value) => setLender((prev) => ({ ...prev, [key]: value }))}
              {...rest2}
            />
          ))}
        </div>
        <ImageSlot
          label="Lender logo"
          image={community.lenderLogo?.url ?? null}
          alt="Lender logo"
          read={logoToDataUrl}
          onPick={uploadLogo}
          use="lenderlogo"
          onRemove={community.lenderLogo ? removeLogo : undefined}
          removeWarning="Remove the lender logo?"
          hint="Saves as soon as it uploads. PNG, WebP, JPEG or GIF up to 3 MB."
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={!dirty || saver.saving} onClick={saveLender}>
            {saver.saving ? 'Saving…' : 'Save lender'}
          </button>
          {dirty ? <span className="tag tag-accent">Unsaved changes</span> : null}
          <SaveNote saver={saver} />
        </div>
        {hasLender && c.lender.name && !c.lender.nmls ? (
          <p className="ax-callout" style={{ margin: 0, fontSize: 14 }}>
            Add the lender&apos;s NMLS ID. A lender advertised without one is incomplete. Have the lender approve the back before you hand it out.
          </p>
        ) : null}
      </div>

      <div ref={stage} className="fl-stage">
        <div id="plan-doc" className="fl-doc" style={{ '--fl-zoom': zoom }}>
          {/* FRONT: the home */}
          <section className="fl-page fl-front" aria-label="Front of the flyer">
            <div className="fl-hero">
              {lead ? <img src={lead.url} alt="" /> : <div className="fl-hero__none" />}
              <div className="fl-badge">
                {community.status && community.status !== 'Active' ? <span className="fl-status">{community.status}</span> : <span className="fl-status">For sale</span>}
                {price ? <strong>{money(price)}</strong> : null}
              </div>
            </div>
            <div className="fl-body">
              <h1 className="fl-address">{community.name}</h1>
              <p className="fl-city">{community.location}</p>
              {facts.length ? <p className="fl-facts">{facts.map((f) => <span key={f}>{f}</span>)}</p> : null}
              {home?.description ? <p className="fl-desc">{home.description}</p> : null}
              {rest.length ? (
                <div className="fl-thumbs">
                  {rest.slice(0, 3).map((p) => <img key={p.id ?? p.url} src={p.url} alt="" />)}
                </div>
              ) : null}
              {sessions.length ? (
                <div className="fl-open">
                  <span className="fl-label">Open house</span>
                  <ul>
                    {sessions.map((s) => (
                      <li key={`${s.date}${s.start}`}><strong>{sessionDate(s.date)}</strong> {sessionTimes(s)}{s.note ? <em> · {s.note}</em> : null}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="fl-agent">
              {agent?.photo?.url ? <img className="fl-face" src={agent.photo.url} alt="" /> : <span className="fl-face fl-face--initial">{agent?.name?.trim()?.[0] ?? ''}</span>}
              <div className="fl-agent__who">
                <strong>{agent?.name ?? ''}</strong>
                {agent?.brokerage ? <span>{agent.brokerage}</span> : null}
                {license ? <span>{license}</span> : null}
                {settings.mlsNumber ? <span>MLS #{settings.mlsNumber}</span> : null}
                <span className="fl-agent__contact">
                  {agentPhone ? <a href={telHref(agentPhone) || undefined}>{agentPhone}</a> : null}
                  {agent?.email ? <span>{agent.email}</span> : null}
                </span>
              </div>
              <div className="fl-qr">
                {qr ? <img src={qr} alt={`QR code for ${community.name}`} /> : null}
                <span>Scan for photos, payment estimate and a showing</span>
              </div>
            </div>
            <p className="fl-url">{buyerUrl(community)}</p>
          </section>

          {/* BACK: financing */}
          <section className="fl-page fl-back" aria-label="Back of the flyer">
            <header className="fl-back__head">
              <span className="fl-label">Financing this home</span>
              <h2>{community.name}</h2>
              {price ? <p className="fl-back__price">Listed at <strong>{money(price)}</strong></p> : null}
            </header>

            {rows.length ? (
              <div className="fl-pay">
                <span className="fl-label">What it could cost each month</span>
                <div className="fl-pay__grid">
                  {rows.map((r) => (
                    <div className="fl-pay__card" key={`${r.label}${r.note}`}>
                      <span className="fl-pay__what">{r.label}</span>
                      <span className="fl-pay__note">{r.note} · {money(r.down)}</span>
                      <strong>{money(r.total)}<small>/mo</small></strong>
                      <span className="fl-pay__rate">{r.rate.toFixed(2)}% rate, 30-yr fixed</span>
                    </div>
                  ))}
                </div>
                <p className="fl-pay__fine">
                  Estimates include principal and interest{rows[0].tax > 0 ? ', taxes' : ''}{rows[0].insurance > 0 ? ', insurance' : ''}{rows.some((r) => r.mi > 0) ? ', mortgage insurance where it applies' : ''}{rows[0].hoa > 0 ? ' and HOA' : ''}. Not a quote.
                </p>
              </div>
            ) : null}

            <div className="fl-steps">
              <span className="fl-label">From offer to keys</span>
              <ol>
                <li><strong>Get pre-approved.</strong> Talk with a lender before you tour so you know your budget.</li>
                <li><strong>Make an offer.</strong> Your agent writes it with your pre-approval letter.</li>
                <li><strong>Lock and close.</strong> Appraisal, final approval, then sign and get the keys.</li>
              </ol>
            </div>

            <div className="fl-ready">
              <span className="fl-label">Have these ready for your lender</span>
              <ul>
                <li>Photo ID and Social Security number</li>
                <li>Pay stubs from the last 30 days</li>
                <li>W-2s or tax returns for the last two years</li>
                <li>Two months of bank statements</li>
                <li>A list of your monthly debts</li>
                <li>Where your down payment is coming from</li>
              </ul>
            </div>

            <div className="fl-lender">
              {hasLender ? (
                <>
                  <div className="fl-lender__main">
                    {community.lenderLogo?.url ? <img className="fl-lender__logo" src={community.lenderLogo.url} alt="" /> : null}
                    <span className="fl-label">Your lender</span>
                    <strong className="fl-lender__name">{c.lender.name}</strong>
                    {c.lender.nmls ? <span>NMLS #{c.lender.nmls}</span> : null}
                    {c.lo ? <span>{c.lo.name} · NMLS #{c.lo.nmls}</span> : null}
                    {c.lender.phone ? <span>{c.lender.phone}</span> : null}
                    {c.lender.email ? <span>{c.lender.email}</span> : null}
                    {c.lender.website ? <span>{c.lender.website.replace(/^https?:\/\//, '')}</span> : null}
                    {c.lender.address ? <span>{c.lender.address}</span> : null}
                  </div>
                  {applyQr ? (
                    <div className="fl-qr">
                      <img src={applyQr} alt="QR code for the loan application" />
                      <span>Scan to start your loan application</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="fl-lender__main">
                  <span className="fl-label">Ready to talk financing?</span>
                  <strong className="fl-lender__name">Ask {agent?.name ?? 'your agent'} for a lender introduction</strong>
                  {agentPhone ? <span>{agentPhone}</span> : null}
                  {agent?.email ? <span>{agent.email}</span> : null}
                  <span className="no-print fl-hint">Add your lender above and their details print here.</span>
                </div>
              )}
            </div>

            {agent?.name ? (
              <p className="fl-backagent">
                Questions? <strong>{agent.name}</strong>{agentPhone ? ` · ${agentPhone}` : ''}{agent.email ? ` · ${agent.email}` : ''}
              </p>
            ) : null}

            <footer className="fl-back__foot">
              <p>{fine}</p>
              {c.lender.name ? (
                c.statements.filter((s) => s.key !== 'disclaimer').map((s) => <p key={s.key}>{s.text}</p>)
              ) : null}
              {c.license ? <p>{c.license}</p> : null}
              {c.lender.nmls ? <p>Verify licensing at nmlsconsumeraccess.org.</p> : null}
              {settings.listingDisclosure ? <p>{settings.listingDisclosure}</p> : null}
              <p>
                Listing agent: {agent?.name}{agent?.brokerage ? `, ${agent.brokerage}` : ''}{license ? ` · ${license}` : ''}.
                Lender details were supplied by the listing agent.
              </p>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
