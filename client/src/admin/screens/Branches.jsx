import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { plural, sortBranches } from '../branches.js';
import AdminShell from '../shell/AdminShell.jsx';
import { Dialog, ErrorNote, Field, Spinner, TextField } from '../ui.jsx';
import { CheckGroup } from './AccessPicker.jsx';

/** The longest name a branch can have; the server refuses more. */
const NAME_MAX = 80;

/**
 * A small pop-up with one field: the branch's new name. The server refuses a blank one and a name another branch
 * has (whatever its case), in its own words, and those words stay in the pop-up with the name still typed.
 */
function RenameDialog({ branch, onClose, onSaved }) {
  const { token } = useAdmin();
  const [name, setName] = useState(branch.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the branch a name.');
      return;
    }
    if (trimmed === branch.name) {
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const row = await adminApi.renameBranch(token, branch.id, trimmed);
      onSaved({ ...branch, name: trimmed, ...(row?.id === branch.id ? row : {}) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Rename ${branch.name}`}
      onClose={onClose}
      actions={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      )}
    >
      <form onSubmit={(event) => { event.preventDefault(); save(); }} style={{ display: 'contents' }}>
        <TextField label="Branch name" value={name} onChange={setName} maxLength={NAME_MAX} autoComplete="off" />
      </form>
      <ErrorNote>{error}</ErrorNote>
    </Dialog>
  );
}

/**
 * The companies or groups the communities and people are sorted into, for the owner. A branch is a name with
 * two lists: the communities in it (each community is in at most one, so ticking one here takes it out of the
 * branch it was in, which the box says beside the name) and the people in it (members only; the owner has
 * everything by role and is not listed). A person in a branch can open every community in it, now and later,
 * and the owner still sees everything. The boxes save as they are ticked, with Saved beside the list's name for
 * a moment. Deleting a branch keeps its communities and people; only the grouping goes, and with it the access
 * it gave, which the question says before it is done.
 */
export default function Branches() {
  const { token } = useAdmin();
  const [branches, setBranches] = useState(null);
  const [communities, setCommunities] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [createError, setCreateError] = useState('');
  // '' when nothing is in flight, 'new' while the form sends, or the id of the branch a button is working on.
  const [busy, setBusy] = useState('');
  // The sentence that says what the last new branch or deletion did.
  const [note, setNote] = useState(null);
  // The word beside one list's name after a tick: { id, what: 'communities' | 'members', text, warn }.
  const [saved, setSaved] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const nameField = useRef(null);
  const noteLine = useRef(null);
  // A deletion leaves the keyboard on nothing (the card is gone), so the sentence that says so takes it.
  const focusNote = useRef(false);
  // Ticks go to the server one after another, in the order they were made, so two quick ones cannot overtake
  // each other and leave the server holding the earlier set.
  const saves = useRef(Promise.resolve());

  const reload = () => adminApi.branches(token).then((list) => setBranches(sortBranches(list))).catch((err) => setError(err.message));

  useEffect(() => {
    adminApi.branches(token).then((list) => setBranches(sortBranches(list))).catch((err) => setError(err.message));
    // The side menu lists the communities; here they and the team are also the boxes on every card.
    adminApi.communities(token).then(setCommunities).catch(() => {});
    adminApi.team(token).then(setMembers).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!focusNote.current) return;
    focusNote.current = false;
    noteLine.current?.focus();
  }, [note]);

  const create = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setCreateError('Give the branch a name: the company or the group.');
      nameField.current?.focus();
      return;
    }
    setBusy('new');
    setCreateError('');
    setNote(null);
    try {
      const row = await adminApi.createBranch(token, trimmed);
      const created = { name: trimmed, communityIds: [], memberIds: [], ...row };
      setBranches((list) => sortBranches([...(list ?? []).filter((b) => b.id !== created.id), created]));
      setName('');
      setNote({ text: `${created.name} is ready. Tick its communities and people below.`, warn: false });
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setBusy('');
      nameField.current?.focus({ preventScroll: true });
    }
  };

  /**
   * A tick on a branch's list: the boxes show the new set at once and the server is told. For communities the
   * other branches' boxes change too, since a community ticked here leaves the branch it was in. Saved appears
   * beside the list's name for a moment; a refusal stays there, in the server's words, and the branches are read
   * again so the boxes show what the server really holds.
   */
  const saveList = (branch, what, ids) => {
    const key = what === 'communities' ? 'communityIds' : 'memberIds';
    setBranches((list) => list.map((b) => {
      if (b.id === branch.id) return { ...b, [key]: ids };
      return what === 'communities' ? { ...b, communityIds: b.communityIds.filter((id) => !ids.includes(id)) } : b;
    }));
    setSaved({ id: branch.id, what, text: 'Saving…', warn: false });
    saves.current = saves.current.then(async () => {
      try {
        if (what === 'communities') await adminApi.setBranchCommunities(token, branch.id, ids);
        else await adminApi.setBranchMembers(token, branch.id, ids);
        setSaved({ id: branch.id, what, text: 'Saved', warn: false });
        window.setTimeout(() => {
          setSaved((current) => (current?.id === branch.id && current.what === what && current.text === 'Saved' ? null : current));
        }, 2500);
      } catch (err) {
        setSaved({ id: branch.id, what, text: `Not saved: ${err.message}`, warn: true });
        reload();
      }
    });
  };

  const confirmDelete = async () => {
    const branch = deleting;
    setBusy(branch.id);
    setDeleteError('');
    try {
      await adminApi.deleteBranch(token, branch.id);
      setBranches((list) => list.filter((b) => b.id !== branch.id));
      setDeleting(null);
      focusNote.current = true;
      setNote({ text: `${branch.name} is gone. Its communities and people are still here, just not grouped.`, warn: false });
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setBusy('');
    }
  };

  const people = members.filter((member) => member.role !== 'owner');
  // Which branch each community is in now, for the word beside a box in every other branch's list.
  const branchOf = new Map();
  for (const branch of branches ?? []) for (const id of branch.communityIds ?? []) branchOf.set(id, branch);
  // The side menu groups its list by each row's branch. On this page the cards are what moves communities
  // between branches, so the rows take their branch from the cards rather than from the list read at the start,
  // and a community ticked into another branch is under that name in the menu at once. Until the branches have
  // arrived the rows say what the server said.
  const rows = branches === null ? communities : communities.map((community) => {
    const branch = branchOf.get(community.id);
    return { ...community, branchId: branch?.id ?? null, branchName: branch?.name ?? null };
  });
  const noteOf = (branch, what) => (saved?.id === branch.id && saved.what === what ? saved : null);

  return (
    <AdminShell
      communities={rows}
      branches={branches ?? []}
      title="Branches"
      blurb="Companies or groups. People in a branch can open every community in it, now and later; you still see everything."
    >
      <ErrorNote>{error}</ErrorNote>

      <form className="card elev-sm" onSubmit={create} style={{ gap: 10, marginBottom: 18 }}>
        <h2 className="card-title" style={{ margin: 0, fontSize: 18 }}>New branch</h2>
        <p className="card-body" style={{ margin: 0 }}>
          Name the company or the group, then tick its communities and its people on the card that appears. A
          community can be in one branch; a person can be in several.
        </p>
        <div className="as-invite">
          <Field label="Branch name">
            <input
              ref={nameField} className="input" type="text" autoComplete="off" value={name} maxLength={NAME_MAX}
              onChange={(event) => setName(event.target.value)} placeholder="e.g. Summit Homes"
            />
          </Field>
          <div className="as-invite__send">
            <button type="submit" className="btn btn-primary" disabled={busy === 'new'}>
              {busy === 'new' ? 'Adding…' : 'Add branch'}
            </button>
          </div>
        </div>
        <ErrorNote>{createError}</ErrorNote>
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

      {branches === null && !error ? <Spinner /> : null}
      {branches && branches.length === 0 ? (
        <div className="as-empty">
          <strong>No branches yet.</strong>
          <span>Make one above to box off a company or a group, and give its people every community in it at once.</span>
        </div>
      ) : null}

      {branches?.length ? (
        <div className="as-branches">
          {branches.map((branch) => {
            const communityIds = branch.communityIds ?? [];
            const memberIds = branch.memberIds ?? [];
            const headingId = `branch-${branch.id}`;
            return (
              <section key={branch.id} className="card elev-sm as-branch" aria-labelledby={headingId}>
                <div className="as-branch__head">
                  <div className="as-branch__text">
                    <h2 className="card-title as-branch__name" id={headingId}>{branch.name}</h2>
                    <span className="as-branch__count">
                      {plural(communityIds.length, 'community', 'communities')} · {plural(memberIds.length, 'person', 'people')}
                    </span>
                  </div>
                  <div className="as-branch__actions">
                    <button
                      type="button" className="btn btn-ghost" onClick={() => setRenaming(branch)} disabled={busy === branch.id}
                      aria-label={`Rename ${branch.name}`} aria-haspopup="dialog"
                    >
                      Rename
                    </button>
                    <button
                      type="button" className="btn btn-danger" onClick={() => setDeleting(branch)} disabled={busy === branch.id}
                      aria-label={`Delete ${branch.name}`} aria-haspopup="dialog"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="as-branch__cols">
                  <CheckGroup
                    legend="Communities"
                    note={noteOf(branch, 'communities')}
                    hint="Everyone in this branch can open these."
                    empty={communities.length === 0 ? <span className="as-member__line">No communities yet.</span> : null}
                  >
                    {communities.map((community) => {
                      const elsewhere = branchOf.get(community.id);
                      const moved = elsewhere && elsewhere.id !== branch.id ? elsewhere.name : '';
                      return (
                        <label key={community.id} className="as-check">
                          <input
                            type="checkbox"
                            checked={communityIds.includes(community.id)}
                            onChange={(event) => saveList(branch, 'communities', event.target.checked
                              ? [...communityIds, community.id]
                              : communityIds.filter((id) => id !== community.id))}
                          />
                          <span>
                            {community.name}
                            {moved ? <span className="as-check__hint"> · in {moved}</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </CheckGroup>
                  <CheckGroup
                    legend="People"
                    note={noteOf(branch, 'members')}
                    hint="Members only; you see everything already."
                    empty={people.length === 0 ? (
                      <span className="as-member__line">Nobody to add yet. Invite people from <Link to="/admin/team">Team</Link>.</span>
                    ) : null}
                  >
                    {people.map((member) => (
                      <label key={member.id} className="as-check">
                        <input
                          type="checkbox"
                          checked={memberIds.includes(member.id)}
                          onChange={(event) => saveList(branch, 'members', event.target.checked
                            ? [...memberIds, member.id]
                            : memberIds.filter((id) => id !== member.id))}
                        />
                        <span>
                          {member.email}
                          {!member.passwordSet ? <span className="as-check__hint"> · invited</span> : null}
                        </span>
                      </label>
                    ))}
                  </CheckGroup>
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {renaming ? (
        <RenameDialog
          branch={renaming}
          onClose={() => setRenaming(null)}
          onSaved={(row) => {
            setBranches((list) => sortBranches(list.map((b) => (b.id === row.id ? { ...b, ...row } : b))));
            setRenaming(null);
          }}
        />
      ) : null}

      {deleting ? (
        <Dialog
          title={`Delete ${deleting.name}?`}
          onClose={() => setDeleting(null)}
          actions={(
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={busy === deleting.id}>
                {busy === deleting.id ? 'Deleting…' : 'Delete'}
              </button>
            </>
          )}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Its {plural((deleting.communityIds ?? []).length, 'community', 'communities')} and{' '}
            {plural((deleting.memberIds ?? []).length, 'person', 'people')} are kept; only the grouping goes. The people in it
            keep the communities ticked for them on their own, and lose the ones they had only through the branch.
          </p>
          <ErrorNote>{deleteError}</ErrorNote>
        </Dialog>
      ) : null}
    </AdminShell>
  );
}
