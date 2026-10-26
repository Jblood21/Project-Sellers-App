import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { telHref } from '@shared/compliance.js';
import {
  LEAD_SORTS, countPendingTours, describeTour, isArchived, isReadyToCall, isTourPending, isUnread, lenderNameOf, sortLeads, toolsUsedOf,
} from '@shared/domain.js';
import { emailHref, textHref } from '../../lib/contact.js';
import { shortDate } from '../../lib/format.js';
import PdfReportButton from '../PdfReportButton.jsx';
import ReportButton from '../ReportButton.jsx';
import LeadDetail from '../screens/LeadDetail.jsx';
import NavIcon from '../shell/navIcons.jsx';
import { Dialog, PillRow, Spinner } from '../ui.jsx';

const plural = (n, one) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * Everyone who entered the app. On a computer the list sits beside the person you picked; on a phone
 * the list is one page and the person is the next. Filtering (who is shown) and sorting (in what order)
 * are separate controls, and the reports live behind one button.
 */
export default function LeadsTab({
  community, leads, reload, onOpenSetup, leadId = '', onOpened, notesDirtyRef, leaveOk,
}) {
  const [query, setQuery] = useState('');
  // A link from the Today page can say which people to show first (?show=ready or ?show=tour).
  const [params] = useSearchParams();
  const [chosen, setFilter] = useState(() => (['unread', 'tour', 'ready', 'closed'].includes(params.get('show')) ? params.get('show') : 'active'));
  const [sort, setSort] = useState('recent');
  const [reportsOpen, setReportsOpen] = useState(false);

  // Pills that would only ever read zero are not shown at all — an empty filter
  // is one more thing to scan past for no information.
  const everyone = leads ?? [];
  const pendingTours = countPendingTours(everyone);
  const unread = everyone.filter((lead) => isUnread(lead) && !isArchived(lead)).length;
  const archived = everyone.filter(isArchived).length;
  const agreed = everyone.filter(isReadyToCall).length;
  // The filter in use. If the one chosen has nobody left (the last unread person was opened, the last call was
  // handled, the last closed person was brought back), its pill is gone and so is it: back to Active, never an
  // empty list with nothing highlighted.
  const filter = (chosen === 'unread' && !unread) || (chosen === 'tour' && !pendingTours) || (chosen === 'ready' && !agreed)
    || (chosen === 'closed' && !archived)
    ? 'active'
    : chosen;

  const rows = useMemo(() => {
    if (!leads) return [];
    // Every view except "Closed" hides archived leads — that is what archiving is
    // for. Closed shows only those, so nothing is ever unreachable.
    let out = filter === 'closed' ? leads.filter(isArchived) : leads.filter((l) => !isArchived(l));
    // The person on screen stays in the Unread list after opening them marks them read, so the row you clicked
    // does not vanish from under you.
    if (filter === 'unread') out = out.filter((lead) => isUnread(lead) || lead.id === leadId);
    else if (filter === 'tour') out = out.filter(isTourPending);
    // Agreed to calls and gave a number, but no call waiting; the person on screen stays, as with Unread.
    else if (filter === 'ready') out = out.filter((lead) => isReadyToCall(lead) || lead.id === leadId);
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((lead) => `${lead.name} ${lead.email} ${lead.phone || ''}`.toLowerCase().includes(q));
    return sortLeads(out, sort);
  }, [filter, leadId, leads, query, sort]);

  if (!leads) return <Spinner label="Loading leads…" />;

  const lender = lenderNameOf(community);

  return (
    <div className={`as-leads${leadId ? ' has-detail' : ''}`}>
      <section className="as-leads__list" aria-label="People">
        <div className="as-bar">
          <div className="as-bar__row">
            <input
              className="input"
              type="search"
              aria-label="Search by name, email or phone"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search leads"
            />
            <button type="button" className="btn btn-secondary" onClick={() => setReportsOpen(true)} aria-haspopup="dialog">
              <NavIcon name="doc" size={16} /> Reports
            </button>
          </div>
          <div className="as-bar__row">
            <span className="as-bar__label" aria-hidden="true">Show</span>
            <PillRow
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'active', label: 'Active' },
                ...(unread ? [{ value: 'unread', label: `Unread ${unread}` }] : []),
                ...(pendingTours ? [{ value: 'tour', label: `📞 ${pendingTours}` }] : []),
                ...(agreed ? [{ value: 'ready', label: `Agreed, no call ${agreed}` }] : []),
                ...(archived ? [{ value: 'closed', label: `Closed ${archived}` }] : []),
              ]}
            />
          </div>
          <div className="as-bar__row">
            <label className="as-bar__label" htmlFor="lead-sort">Sort</label>
            <select id="lead-sort" className="input" value={sort} onChange={(event) => setSort(event.target.value)}>
              {Object.entries(LEAD_SORTS).map(([value, option]) => (
                <option key={value} value={value}>{option.label}</option>
              ))}
            </select>
            <span className="as-count" role="status">
              {rows.length} {rows.length === 1 ? 'person' : 'people'}
            </span>
          </div>
          {pendingTours > 0 ? (
            <button type="button" className="as-callbanner" onClick={() => setFilter('tour')}>
              <span aria-hidden="true">📞</span>
              <span style={{ flex: 1 }}>
                {pendingTours === 1 ? '1 person is waiting for a call' : `${pendingTours} people are waiting for a call`}
              </span>
              <span style={{ fontWeight: 600, opacity: 0.8 }}>{filter === 'tour' ? 'Showing' : 'Show →'}</span>
            </button>
          ) : null}
        </div>

        {leads.length === 0 ? (
          <div className="as-empty">
            <strong>No leads yet</strong>
            <span>Post the QR sign. Anyone who enters the app leaves their name, email and phone.</span>
          </div>
        ) : null}

        {leads.length > 0 && rows.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 14 }}>
            {filter === 'active' && archived === leads.length
              ? 'Every lead is archived. Tap Closed to see them.'
              : 'No leads match that search or filter.'}
          </p>
        ) : null}

        <ul className="as-people">
          {rows.map((lead) => {
            const selected = lead.id === leadId;
            const canReach = Boolean(lead.phone && lead.consent?.granted);
            const tel = canReach ? telHref(lead.phone) : '';
            const sms = canReach ? textHref(lead.phone) : '';
            const mail = emailHref(lead.email);
            const pending = isTourPending(lead);
            // Late by the day the reports and the Today page count in (the server's), not this device's clock.
            const late = pending && lead.callLate;
            return (
              <li key={lead.id} className={`as-lead${selected ? ' is-selected' : ''}`}>
                <Link
                  className="as-lead__main"
                  to={`/admin/communities/${community.id}/leads/${lead.id}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={(event) => {
                    // Typed notes on the person on screen would be lost: ask first.
                    if (!selected && leaveOk && !leaveOk()) event.preventDefault();
                  }}
                >
                  <span className="as-lead__top">
                    {isUnread(lead) ? <span className="as-lead__dot" title="Not opened yet" aria-hidden="true" /> : null}
                    <span className="as-lead__name">{lead.name}</span>
                    {isUnread(lead) ? <span className="as-chip as-chip--soft">Unread</span> : null}
                  </span>
                  <span className="as-lead__chips">
                    {pending ? (
                      <span className={`as-chip ${late ? 'as-chip--late' : 'as-chip--call'}`}>
                        📞 {late ? 'Past their day · ' : ''}{describeTour(lead.tour, lender)}
                      </span>
                    ) : null}
                    {/*
                      Next to the phone number, because that is where somebody's eye goes
                      before they dial. A consent record filed away where nobody reads it
                      does not stop the call that costs $500.
                    */}
                    {lead.consent?.granted ? null : (
                      <span className="as-chip as-chip--stop">Do not call · {lead.consent ? 'declined' : 'never asked'}</span>
                    )}
                    {lead.status === 'contacted' ? <span className="as-chip">Contacted</span> : null}
                    {isArchived(lead) ? <span className="as-chip">Archived</span> : null}
                  </span>
                  <span className="as-lead__line">
                    {lead.phone ? <span className="as-lead__phone">{lead.phone}</span> : null}
                    {lead.phone && lead.email ? ' · ' : null}
                    {lead.email}
                  </span>
                  <span className="as-lead__meta">
                    {plural(toolsUsedOf(lead).length, 'tool')} used · ★ {lead.savedHomeIds.length} saved · {plural(lead.activityCount ?? 0, 'action')} ·{' '}
                    {shortDate(lead.firstVisitAt)}
                  </span>
                </Link>
                {tel || mail ? (
                  <div className="as-lead__actions">
                    {tel ? <a className="btn btn-primary" href={tel} aria-label={`Call ${lead.name}`}><NavIcon name="phone" size={15} /> Call</a> : null}
                    {sms ? <a className="btn btn-secondary" href={sms} aria-label={`Text ${lead.name}`}><NavIcon name="chat" size={15} /> Text</a> : null}
                    {mail ? <a className="btn btn-secondary" href={mail} aria-label={`Email ${lead.name}`}><NavIcon name="mail" size={15} /> Email</a> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="as-leads__detail" aria-label="Person">
        {leadId ? (
          <LeadDetail
            key={leadId} community={community} reload={reload} leadId={leadId} embedded
            onOpened={onOpened} dirtyRef={notesDirtyRef} leaveOk={leaveOk}
          />
        ) : (
          <div className="as-leads__empty">
            <strong>Pick someone from the list</strong>
            <span>Their details, notes and reports show up here.</span>
          </div>
        )}
      </section>

      {reportsOpen ? (
        <Dialog
          title="Reports"
          onClose={() => setReportsOpen(false)}
          actions={<button type="button" className="btn btn-secondary" onClick={() => setReportsOpen(false)}>Close</button>}
        >
          <div className="card elev-sm" style={{ gap: 8 }}>
            <span className="card-kicker">Email the report</span>
            <ReportButton
              community={community}
              reload={reload}
              onOpenSetup={() => {
                setReportsOpen(false);
                onOpenSetup?.();
              }}
            />
          </div>
          <div className="card elev-sm" style={{ gap: 8 }}>
            <PdfReportButton community={community} title="PDF report" sort={sort} />
          </div>
          <p className="text-muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.45 }}>
            People you have closed are left out of every report.
          </p>
        </Dialog>
      ) : null}
    </div>
  );
}
