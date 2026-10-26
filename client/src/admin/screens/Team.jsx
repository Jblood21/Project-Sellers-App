import { useEffect, useRef, useState } from 'react';

import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { accessSummary } from '../branches.js';
import AdminShell from '../shell/AdminShell.jsx';
import { Dialog, ErrorNote, Field, Spinner } from '../ui.jsx';
import AccessPicker from './AccessPicker.jsx';

const dateOf = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/** The line under a person's address: when they joined, or that they are still to set a password. */
const statusLine = (member) => (member.passwordSet
  ? `Joined ${dateOf(member.createdAt)}`
  : `Invited ${dateOf(member.invitedAt)} · has not set a password yet`);

/**
 * What the server's answer to an invite (or a resend) means for the person reading the page. The account is
 * made either way; when the email did not go, the reason is the server's own (email off on the site, or what
 * the provider said), so a Resend problem is in front of the owner and not only in a log.
 */
const outcomeOf = (result, { resent = false } = {}) => {
  const { email } = result.admin;
  if (result.sent) return { text: `An invite is on its way to ${email}. The link works once, for 7 days.`, warn: false };
  return {
    text: resent
      ? `The invite to ${email} could not be emailed: ${result.reason}`
      : `${email} was added, but the invite could not be emailed: ${result.reason}`,
    warn: true,
  };
};

/**
 * The pop-up that changes what one member can open: their branches and their own communities, saved together
 * as one list each, so the row never shows half of a change. Cancel (or Escape) throws the ticks away; Save
 * tells the server and hands the row back as the server now holds it. A refusal stays in the pop-up, in the
 * server's words, with the ticks still there to try again.
 */
function AccessDialog({ member, branches, communities, onClose, onSaved }) {
  const { token } = useAdmin();
  const [access, setAccess] = useState({ branchIds: member.branchIds ?? [], communityIds: member.communityIds ?? [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const row = await adminApi.setAdminAccess(token, member.id, access);
      // The row as the server sees it; the ticks fall back to what was chosen should the answer leave them out.
      onSaved({ ...member, ...access, ...(row?.id === member.id ? row : {}) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Access for ${member.email}`}
      onClose={onClose}
      actions={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      )}
    >
      <p className="card-body" style={{ margin: 0 }}>
        They can open every community in the branches you tick, now and later, and the communities you tick on
        their own, and do everything inside those.
      </p>
      <AccessPicker branches={branches} communities={communities} {...access} onChange={setAccess} />
      <ErrorNote>{error}</ErrorNote>
    </Dialog>
  );
}

/**
 * Everyone who can sign in, and the way to add or remove someone. This page is the owner's: the one account the
 * environment names (ADMIN_EMAIL) sees every community and everything on this page, while each person invited
 * from here is a member who sees only what the owner gives them, and can do everything inside those. What a
 * member has is the communities of every branch they are in (now and later) plus the communities ticked for
 * them on their own; each row says so in one line, and Edit access opens the pop-up that changes it. What no one
 * can do is remove themselves, and the server keeps the last account whatever is asked. Inviting makes the
 * account at once and emails a set-password link, so the list shows the person straight away, marked until they
 * have chosen a password.
 */
export default function Team() {
  const { token, admin } = useAdmin();
  const [members, setMembers] = useState(null);
  const [communities, setCommunities] = useState([]);
  // null until they have arrived; [] when the server has none (or would not say), so the page still works.
  const [branches, setBranches] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  // The branches and communities ticked for the person about to be invited.
  const [inviteAccess, setInviteAccess] = useState({ branchIds: [], communityIds: [] });
  const [inviteError, setInviteError] = useState('');
  // '' when nothing is in flight, 'invite' while the form sends, or the id of the person a button is working on.
  const [busy, setBusy] = useState('');
  // The sentence that says what the last invite, resend or removal did.
  const [note, setNote] = useState(null);
  // The word beside one member's access line after the pop-up saved: { id, text }. It goes away on its own.
  const [accessNote, setAccessNote] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removeError, setRemoveError] = useState('');
  const emailField = useRef(null);
  const noteLine = useRef(null);
  // A resend or a removal leaves the keyboard on nothing (the button is disabled, or gone with its row), so
  // the sentence that says what happened takes it, and is read out; taking the keyboard also scrolls it into
  // view, which on a phone with a long list is the only way the person sees it at all. An invite puts the
  // keyboard back on the address field instead, ready for the next person.
  const focusNote = useRef(false);

  useEffect(() => {
    adminApi.team(token).then(setMembers).catch((err) => setError(err.message));
    // The side menu lists the communities on every page without one; here they are also the boxes to tick.
    adminApi.communities(token).then(setCommunities).catch(() => {});
    adminApi.branches(token).then((list) => setBranches(list ?? [])).catch(() => setBranches([]));
  }, [token]);

  useEffect(() => {
    if (!focusNote.current) return;
    focusNote.current = false;
    noteLine.current?.focus();
  }, [note]);

  const invite = async (event) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      setInviteError('Enter the email address to invite.');
      emailField.current?.focus();
      return;
    }
    setBusy('invite');
    setInviteError('');
    setNote(null);
    try {
      const result = await adminApi.inviteAdmin(token, address, inviteAccess.communityIds, inviteAccess.branchIds);
      // The row as the server sees it; the access falls back to what was ticked should the answer leave it out.
      const created = { role: 'member', ...inviteAccess, ...result.admin };
      setMembers((list) => [...(list ?? []).filter((m) => m.id !== created.id), created]);
      setEmail('');
      setInviteAccess({ branchIds: [], communityIds: [] });
      setNote(outcomeOf(result));
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setBusy('');
      emailField.current?.focus({ preventScroll: true });
    }
  };

  const resend = async (member) => {
    setBusy(member.id);
    setError('');
    setNote(null);
    try {
      const result = await adminApi.resendInvite(token, member.id);
      setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, ...result.admin } : m)));
      focusNote.current = true;
      setNote(outcomeOf(result, { resent: true }));
    } catch (err) {
      // Said where the button was pressed, not at the top of the page. The row may be out of date too (they set
      // their password since the page loaded, or a colleague removed them), so the list is read again.
      focusNote.current = true;
      setNote({ text: `The invite to ${member.email} could not be sent: ${err.message}`, warn: true });
      adminApi.team(token).then(setMembers).catch(() => {});
    } finally {
      setBusy('');
    }
  };

  /** The pop-up saved: the row shows the new line at once, with Saved beside it for a moment. */
  const savedAccess = (saved) => {
    setMembers((list) => list.map((m) => (m.id === saved.id ? saved : m)));
    setEditing(null);
    setAccessNote({ id: saved.id, text: 'Saved' });
    window.setTimeout(() => setAccessNote((current) => (current?.id === saved.id ? null : current)), 2500);
  };

  const confirmRemove = async () => {
    const member = removing;
    setBusy(member.id);
    setRemoveError('');
    try {
      await adminApi.removeAdmin(token, member.id);
      setMembers((list) => list.filter((m) => m.id !== member.id));
      setRemoving(null);
      focusNote.current = true;
      setNote({
        text: member.passwordSet
          ? `${member.email} no longer has access. Any device they were signed in on is signed out.`
          : `${member.email} was removed, and the invite link no longer works.`,
        warn: false,
      });
    } catch (err) {
      setRemoveError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <AdminShell
      communities={communities}
      branches={branches ?? []}
      title="Team"
      blurb="Everyone who can sign in here. You see everything; each person you invite sees only the branches and communities you give them."
    >
      <ErrorNote>{error}</ErrorNote>

      <form className="card elev-sm" onSubmit={invite} style={{ gap: 10, marginBottom: 18 }}>
        <h2 className="card-title" style={{ margin: 0, fontSize: 18 }}>Invite someone</h2>
        <p className="card-body" style={{ margin: 0 }}>
          They get an email with a link to set their password; it works once, for 7 days. Until they have, their
          row below says so, and you can send the invite again. They can open every community in the branches you
          tick, now and later, and the communities you tick on their own, and do everything inside those; Edit
          access below changes it at any time.
        </p>
        <div className="as-invite">
          <Field label="Email">
            <input
              ref={emailField} className="input" type="email" autoComplete="off" spellCheck="false" value={email}
              onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com"
            />
          </Field>
        </div>
        <AccessPicker branches={branches ?? []} communities={communities} {...inviteAccess} onChange={setInviteAccess} compact />
        <div className="as-invite__send">
          <button type="submit" className="btn btn-primary" disabled={busy === 'invite'}>
            {busy === 'invite' ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        <ErrorNote>{inviteError}</ErrorNote>
      </form>

      {note ? (
        <p
          ref={noteLine} tabIndex={-1} role="status"
          className={`as-invite__note${note.warn ? ' as-invite__note--warn' : ''}`}
          style={{ marginBottom: 18 }}
        >
          {note.text}
        </p>
      ) : null}

      <h2 className="as-section-title" style={{ marginTop: 0 }}>Who can sign in</h2>
      {members === null && !error ? <Spinner /> : null}
      {members ? (
        <ul className="as-team">
          {members.map((member) => {
            const you = member.id === admin?.id;
            const owner = member.role === 'owner';
            const working = busy === member.id;
            const canResend = !you && !member.passwordSet;
            // The account the environment makes at every start cannot be removed here; its row says what to do.
            const canRemove = !you && !member.bootstrap;
            return (
              <li key={member.id} className="as-member">
                <div className="as-member__main">
                  <div className="as-member__top">
                    <span className="as-member__email">{member.email}</span>
                    {you ? <span className="tag tag-accent">You</span> : null}
                    {owner ? <span className="tag tag-accent-2">Owner</span> : null}
                    {!member.passwordSet ? <span className="tag tag-neutral">Invited</span> : null}
                  </div>
                  <span className="as-member__line">{statusLine(member)}</span>
                  {member.bootstrap ? (
                    <span className="as-member__line">
                      Set by ADMIN_EMAIL in Render, so it is made again at every deploy. To remove it, change or clear
                      ADMIN_EMAIL and ADMIN_PASSWORD there.
                    </span>
                  ) : null}
                  <span className="as-member__line as-member__access">
                    {/* The names are only right once the branches have arrived; until then the line waits. */}
                    <span className={owner ? 'as-member__all' : undefined}>{branches ? accessSummary(member, branches, communities) : ''}</span>
                    <span className="as-saved" role="status">{accessNote?.id === member.id ? accessNote.text : ''}</span>
                  </span>
                </div>
                {!owner || canResend || canRemove ? (
                  <div className="as-member__actions">
                    {!owner ? (
                      <button
                        type="button" className="btn btn-secondary" onClick={() => setEditing(member)} disabled={working || !branches}
                        aria-label={`Edit access for ${member.email}`} aria-haspopup="dialog"
                      >
                        Edit access
                      </button>
                    ) : null}
                    {canResend ? (
                      <button
                        type="button" className="btn btn-ghost" onClick={() => resend(member)} disabled={working}
                        aria-label={`Resend invite to ${member.email}`}
                      >
                        {working ? 'Sending…' : 'Resend invite'}
                      </button>
                    ) : null}
                    {canRemove ? (
                      <button
                        type="button" className="btn btn-danger" onClick={() => setRemoving(member)} disabled={working}
                        aria-label={`Remove ${member.email}`}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {editing ? (
        <AccessDialog
          member={editing}
          branches={branches ?? []}
          communities={communities}
          onClose={() => setEditing(null)}
          onSaved={savedAccess}
        />
      ) : null}

      {removing ? (
        <Dialog
          title={`Remove ${removing.email}?`}
          onClose={() => setRemoving(null)}
          actions={(
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setRemoving(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={confirmRemove} disabled={busy === removing.id}>
                {busy === removing.id ? 'Removing…' : 'Remove'}
              </button>
            </>
          )}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {removing.passwordSet
              ? 'They will not be able to sign in any more, and any device they are signed in on is signed out. You can invite them again later.'
              : 'Their invite link stops working and they will not be able to sign in. You can invite them again later.'}
          </p>
          <ErrorNote>{removeError}</ErrorNote>
        </Dialog>
      ) : null}
    </AdminShell>
  );
}
