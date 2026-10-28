const JSON_HEADERS = { 'Content-Type': 'application/json' };

// What a person should read when the answer is not ours. A proxy in front of the app
// answers with an HTML page of its own, and a dropped connection has no answer at all.
const PROXY_ANSWERS = {
  408: 'The upload took too long to arrive. Try again on a stronger connection, or with a smaller file.',
  413: 'That upload is too large for the server to accept. Try a smaller file.',
  500: 'Something went wrong on our side. Wait a minute and try again.',
  502: 'The server did not answer. Wait a minute and try again.',
  503: 'The server is busy. Wait a minute and try again.',
  504: 'The server took too long to answer. Try again, or try a smaller file.',
  524: 'The server took too long to answer. Try again, or try a smaller file.',
};

// What to do when the server refuses a token as not signed in (a 401 to a request that carried one):
// the admin app registers a function that ends its session, so a device still holding a token from
// before a password change is put back on the sign-in form by its next request, not left on a page
// that cannot load. A wrong password at sign-in is a 401 too, but that request carries no token.
let sessionRefused = null;
export function onSessionRefused(fn) {
  sessionRefused = fn;
  return () => {
    if (sessionRefused === fn) sessionRefused = null;
  };
}

// The words for a request that never got an answer: no signal, a dropped connection, or a signal so weak the
// request was given up on.
const CONNECTION_FAILED = 'We couldn’t connect. Check your connection and try again.';

function connectionError() {
  const error = new Error(CONNECTION_FAILED);
  // Marks "no answer came", as opposed to an answer that said no: a sign-in check that fails this way must
  // not end the session, and a save that fails this way is worth trying again.
  error.offline = true;
  return error;
}

/**
 * Whether a failed request says "the connection let us down" rather than "the server refused this": no answer at
 * all, a server error (a restart during an update shows as a 502 or 503) or a request that timed out. Those are the
 * failures a person can fix by waiting or moving, so they get the connection wording and a Retry button. A 400 or
 * 403 carries the server's own plain sentence about what is wrong, and trying again would only repeat it.
 */
export function isConnectionError(error) {
  return Boolean(error?.offline) || error?.status >= 500 || error?.status === 408;
}

async function request(path, { method = 'GET', body, token, timeoutMs = 0, keepalive = false } = {}) {
  // A phone on a signal that has gone quiet can leave a request waiting for minutes with nothing to show for it,
  // so a caller that has something to say about that (the sign-in check) gives the wait a limit.
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : 0;
  let res;
  let text;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : JSON_HEADERS),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Lets a request finish after the page is closed or left, for a change that was held back to be undone.
      ...(keepalive ? { keepalive: true } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (res.status !== 204) text = await res.text();
  } catch {
    // The browser's own text for this is "Failed to fetch" (Chrome), "Load failed"
    // (Safari) or "NetworkError when attempting to fetch resource." (Firefox). The connection can
    // also drop part-way through the answer.
    throw connectionError();
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token) sessionRefused?.(token);
    const error = new Error(data?.error || PROXY_ANSWERS[res.status] || `Something went wrong (${res.status}). Try again in a moment.`);
    error.status = res.status;
    throw error;
  }
  return data;
}

/**
 * A file from the admin API, handed to the browser to save. Fetched rather than linked because the admin API is
 * Bearer-authenticated and an <a href> cannot carry the header, so the bytes come back here and the browser is
 * given a blob. A refusal carries the server's own words (too many at once, a bad period) when it has them.
 * Resolves to the name the file was saved under.
 */
async function saveFile(path, token, { fallbackName, failure, type = '' }) {
  let res;
  try {
    res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw connectionError();
  }
  if (!res.ok) {
    if (res.status === 401) sessionRefused?.(token);
    let said = '';
    try {
      said = (await res.json())?.error ?? '';
    } catch {
      said = '';
    }
    const error = new Error(said || PROXY_ANSWERS[res.status] || `${failure} (${res.status})`);
    error.status = res.status;
    throw error;
  }
  // A proxy or a login page in the way answers 200 with a page of its own: that is not the file, so do not save it as one.
  if (type && !(res.headers.get('Content-Type') || '').toLowerCase().startsWith(type)) {
    throw new Error('The server did not send the file. Reload the page and try again.');
  }
  let blob;
  try {
    blob = await res.blob();
  } catch {
    // The connection dropped part-way through the file.
    throw connectionError();
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Not at once: Safari on a phone reads the blob after the click has returned.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return name;
}

// ── buyer ─────────────────────────────────────────────────────────────────
export const buyerApi = {
  community: (id) => request(`/api/c/${encodeURIComponent(id)}`),
  enter: (id, contact) => request(`/api/c/${encodeURIComponent(id)}/leads`, { method: 'POST', body: contact }),
  me: (token) => request('/api/me', { token }),
  toggleSave: (token, homeId) => request('/api/me/saves', { method: 'POST', body: { homeId }, token }),
  savePlan: (token, key, summary) =>
    request(`/api/me/plan/${encodeURIComponent(key)}`, { method: 'PUT', body: { summary }, token }),
  track: (token, text) => request('/api/me/activity', { method: 'POST', body: { text }, token }),
  openSlots: (communityId) => request(`/api/c/${encodeURIComponent(communityId)}/slots`),
  // One whole guide, body included. The community payload carries only the summaries.
  guide: (communityId, slug) =>
    request(`/api/c/${encodeURIComponent(communityId)}/guides/${encodeURIComponent(slug)}`),
  requestTour: (token, slotId, contact, topic = 'community', extra = {}) =>
    request('/api/me/tour', { method: 'POST', body: { slotId, contact, topic, ...extra }, token }),
  // The "Find out if you qualify" message, sent for the buyer. The server chooses who it goes to.
  emailIncentive: (token, body) => request('/api/me/incentive/email', { method: 'POST', body, token }),
  // `also`: one more address to send it to (kept on the buyer's record); '' removes it; leave it out to change nothing.
  emailPlan: (token, also) => request('/api/me/plan/email', { method: 'POST', body: also === undefined ? {} : { also }, token }),
  saveMoveIn: (token, plan) => request('/api/me/movein', { method: 'PUT', body: plan, token }),
};

// ── admin ─────────────────────────────────────────────────────────────────
export const adminApi = {
  login: (email, password) => request('/api/admin/login', { method: 'POST', body: { email, password } }),
  // Whether agents can make their own account here ({ open }), and making one with the access code the owner gave
  // them (answers with a session, like signing in).
  signupOpen: () => request('/api/admin/signup'),
  signup: (email, password, code, about = {}) => request('/api/admin/signup', { method: 'POST', body: { email, password, code, ...about } }),
  // The signed-in agent's own details (name, phone, email, brokerage, licence, portrait), which every new listing starts from.
  myProfile: (token) => request('/api/admin/me/profile', { token }),
  saveMyProfile: (token, body) => request('/api/admin/me/profile', { method: 'PUT', body, token }),
  // Business contacts (lenders) kept on the account, and putting one on a listing or saving a listing's lender as one.
  myContacts: (token) => request('/api/admin/me/contacts', { token }),
  addContact: (token, body) => request('/api/admin/me/contacts', { method: 'POST', body, token }),
  saveContact: (token, id, body) => request(`/api/admin/me/contacts/${encodeURIComponent(id)}`, { method: 'PUT', body, token }),
  removeContact: (token, id) => request(`/api/admin/me/contacts/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  useContact: (token, communityId, contactId) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/lender/use`, { method: 'POST', body: { contactId }, token }),
  saveLenderAsContact: (token, communityId, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/lender/save`, { method: 'POST', body, token }),
  // { id, email, role }: role is 'owner' for the account ADMIN_EMAIL names and 'member' for anyone invited.
  // Given up on after 20 seconds, so a signal that has gone quiet shows the sign-in check's Retry rather than a spinner for good.
  me: (token) => request('/api/admin/me', { token, timeoutMs: 20000 }),
  // The answer is the same whether or not the address has an account; the server says so in `message`.
  forgotPassword: (email) => request('/api/admin/password/forgot', { method: 'POST', body: { email } }),
  // Answers with a session ({ token, admin }) so the page can sign the owner straight in.
  resetPassword: (token, password) => request('/api/admin/password/reset', { method: 'POST', body: { token, password } }),
  // Also answers with a fresh session for this tab; every other one ends.
  changePassword: (token, currentPassword, password) =>
    request('/api/admin/password/change', { method: 'POST', body: { currentPassword, password }, token }),
  // ── the team: everyone who can sign in ──────────────────────────────────
  team: (token) => request('/api/admin/team', { token }),
  // Makes the account and emails a set-password link. Answers { admin, sent } and, when the email did not go
  // (email off on the site, or the provider refused it), `reason` says why; the account exists either way.
  // `branchIds` and `communityIds` are what the new person can open from the start (every community in those
  // branches, now and later, plus those communities on their own); none is fine, and the owner can change both
  // on the Team page later.
  inviteAdmin: (token, email, communityIds = [], branchIds = []) =>
    request('/api/admin/team/invites', { method: 'POST', body: { email, communityIds, branchIds }, token }),
  resendInvite: (token, id) =>
    request(`/api/admin/team/invites/${encodeURIComponent(id)}/resend`, { method: 'POST', body: {}, token }),
  removeAdmin: (token, id) => request(`/api/admin/team/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  // Replaces a member's set of communities. The owner has every community and no set to replace (a 400).
  setAdminCommunities: (token, id, communityIds) =>
    request(`/api/admin/team/${encodeURIComponent(id)}/communities`, { method: 'PUT', body: { communityIds }, token }),
  // Replaces a member's branches and their own communities in one go, the way the Edit access pop-up saves them:
  // one answer, so the row never shows half of a change. Answers the member's row as GET /team lists it.
  setAdminAccess: (token, id, { branchIds, communityIds }) =>
    request(`/api/admin/team/${encodeURIComponent(id)}/access`, { method: 'PUT', body: { branchIds, communityIds }, token }),
  // ── branches: the companies or groups communities and people are put in (the owner only) ──
  // Each row is { id, name, communityIds, memberIds, createdAt }. A community is in at most one branch, so giving
  // one to a branch takes it out of the branch it was in; a person can be in several.
  branches: (token) => request('/api/admin/branches', { token }),
  createBranch: (token, name) => request('/api/admin/branches', { method: 'POST', body: { name }, token }),
  renameBranch: (token, id, name) =>
    request(`/api/admin/branches/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name }, token }),
  // The communities and people stay; only the grouping goes (and with it the access it gave).
  deleteBranch: (token, id) => request(`/api/admin/branches/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  setBranchCommunities: (token, id, communityIds) =>
    request(`/api/admin/branches/${encodeURIComponent(id)}/communities`, { method: 'PUT', body: { communityIds }, token }),
  setBranchMembers: (token, id, adminIds) =>
    request(`/api/admin/branches/${encodeURIComponent(id)}/members`, { method: 'PUT', body: { adminIds }, token }),
  // ── the activity log: what everyone has changed, newest first (the owner only) ──
  // Answers { entries, nextBefore }; `before` is the last page's nextBefore, for the page after it.
  activity: (token, { adminId = '', communityId = '', before = '', limit = 50 } = {}) => {
    const query = new URLSearchParams();
    if (adminId) query.set('adminId', adminId);
    if (communityId) query.set('communityId', communityId);
    if (before) query.set('before', before);
    query.set('limit', String(limit));
    return request(`/api/admin/activity?${query}`, { token });
  },
  communities: (token) => request('/api/admin/communities', { token }),
  today: (token) => request('/api/admin/today', { token }),
  community: (token, id) => request(`/api/admin/communities/${encodeURIComponent(id)}`, { token }),
  createCommunity: (token, body) => request('/api/admin/communities', { method: 'POST', body, token }),
  // A listing: one home an agent is selling, made with its home in one step. Answers the community with `homes: [home]`.
  // Members as well as the owner may make one; ordinary community creation stays the owner's.
  createListing: (token, body) => request('/api/admin/communities', { method: 'POST', body: { ...body, kind: 'listing' }, token }),
  updateCommunity: (token, id, body) =>
    request(`/api/admin/communities/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteCommunity: (token, id) =>
    request(`/api/admin/communities/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  checkRates: (token, id) =>
    request(`/api/admin/communities/${encodeURIComponent(id)}/rates/check`, { method: 'POST', body: {}, token }),
  createHome: (token, communityId, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/homes`, { method: 'POST', body, token }),
  reorderHomePhotos: (token, id, ids) => request(`/api/admin/homes/${encodeURIComponent(id)}/photos/order`, { method: 'PUT', body: { ids }, token }),
  updateHome: (token, id, body) => request(`/api/admin/homes/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteHome: (token, id) => request(`/api/admin/homes/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  addHomePhoto: (token, homeId, body) =>
    request(`/api/admin/homes/${encodeURIComponent(homeId)}/photos`, { method: 'POST', body, token }),
  createHighlight: (token, communityId, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/highlights`, { method: 'POST', body, token }),
  updateHighlight: (token, id, body) =>
    request(`/api/admin/highlights/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteHighlight: (token, id) =>
    request(`/api/admin/highlights/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  addHighlightPhoto: (token, highlightId, body) =>
    request(`/api/admin/highlights/${encodeURIComponent(highlightId)}/photos`, { method: 'POST', body, token }),
  addFloorPlan: (token, homeId, body) =>
    request(`/api/admin/homes/${encodeURIComponent(homeId)}/floorplans`, { method: 'POST', body, token }),
  addCommunityPhoto: (token, communityId, kind, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/photos/${kind}`, {
      method: 'POST', body, token,
    }),
  /**
   * The lead's MISMO 3.4 file. Fetched rather than linked because the admin API
   * is Bearer-authenticated and an <a href> cannot carry the header — so the
   * bytes come back here and the browser is handed a blob to save.
   */
  downloadLeadMismo: (token, leadId) =>
    saveFile(`/api/admin/leads/${encodeURIComponent(leadId)}/mismo`, token, {
      fallbackName: 'lead-mismo34.xml', failure: 'Could not build the file',
    }),
  /**
   * The leads report as a PDF. `period` is all, 7, 30 or 90 (days of sign-ups); `sort` is the Leads tab's own choice
   * (recent or stars). Resolves to the saved file's name.
   */
  downloadLeadsPdf: (token, communityId, period = 'all', sort = 'recent') =>
    saveFile(`/api/admin/communities/${encodeURIComponent(communityId)}/reports/leads.pdf?period=${encodeURIComponent(period)}&sort=${encodeURIComponent(sort)}`, token, {
      fallbackName: 'leads-report.pdf', failure: 'Could not build the report', type: 'application/pdf',
    }),
  /** One person's report as a PDF. */
  downloadLeadPdf: (token, leadId) =>
    saveFile(`/api/admin/leads/${encodeURIComponent(leadId)}/report.pdf`, token, {
      fallbackName: 'user-report.pdf', failure: 'Could not build the report', type: 'application/pdf',
    }),
  createResource: (token, communityId, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/resources`, { method: 'POST', body, token }),
  updateResource: (token, id, body) =>
    request(`/api/admin/resources/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteResource: (token, id) =>
    request(`/api/admin/resources/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  // `keepalive` lets the delete finish after the page has been closed or left, for a photo whose removal was held
  // back for a few seconds so it could be undone.
  deletePhoto: (token, id, { keepalive = false } = {}) =>
    request(`/api/admin/photos/${encodeURIComponent(id)}`, { method: 'DELETE', token, keepalive }),
  // ── realtors: up to MAX_AGENTS per community ────────────────────────────
  createAgent: (token, communityId, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/agents`, { method: 'POST', body, token }),
  updateAgent: (token, id, body) =>
    request(`/api/admin/agents/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteAgent: (token, id) => request(`/api/admin/agents/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  // `photo` is the agent's portrait and `logo` their own or their brokerage's mark.
  // One of each per agent, so a second upload replaces the first.
  setAgentPhoto: (token, id, body) =>
    request(`/api/admin/agents/${encodeURIComponent(id)}/photo`, { method: 'POST', body, token }),
  setAgentLogo: (token, id, body) =>
    request(`/api/admin/agents/${encodeURIComponent(id)}/logo`, { method: 'POST', body, token }),
  // ── buyer guides ────────────────────────────────────────────────────────
  guide: (token, id) => request(`/api/admin/guides/${encodeURIComponent(id)}`, { token }),
  createGuide: (token, communityId, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/guides`, { method: 'POST', body, token }),
  updateGuide: (token, id, body) =>
    request(`/api/admin/guides/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteGuide: (token, id) => request(`/api/admin/guides/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  setGuideImage: (token, id, body) =>
    request(`/api/admin/guides/${encodeURIComponent(id)}/image`, { method: 'POST', body, token }),
  // Back to the shared default picture.
  clearGuideImage: (token, id) =>
    request(`/api/admin/guides/${encodeURIComponent(id)}/image`, { method: 'DELETE', token }),
  // Adds back any supplied guide the community no longer has, by slug. Never
  // overwrites one that is still there, so an edited guide survives it.
  restoreGuides: (token, communityId) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/guides/restore-defaults`, {
      method: 'POST', body: {}, token,
    }),
  // PUT, not POST: a home has one walkthrough, so sending another replaces it.
  setHomeVideo: (token, homeId, body) =>
    request(`/api/admin/homes/${encodeURIComponent(homeId)}/video`, { method: 'PUT', body, token }),
  deleteHomeVideo: (token, homeId) =>
    request(`/api/admin/homes/${encodeURIComponent(homeId)}/video`, { method: 'DELETE', token }),
  slots: (token, communityId) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/slots`, { token }),
  createSlots: (token, communityId, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/slots`, { method: 'POST', body, token }),
  deleteSlot: (token, id) => request(`/api/admin/slots/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  leads: (token, communityId) => request(`/api/admin/communities/${encodeURIComponent(communityId)}/leads`, { token }),
  sendReport: (token, communityId) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/report`, { method: 'POST', body: {}, token }),
  lead: (token, id) => request(`/api/admin/leads/${encodeURIComponent(id)}`, { token }),
  updateLead: (token, id, body) => request(`/api/admin/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
};
