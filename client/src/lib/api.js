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

async function request(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body === undefined ? {} : JSON_HEADERS),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // The browser's own text for this is "Failed to fetch" (Chrome), "Load failed"
    // (Safari) or "NetworkError when attempting to fetch resource." (Firefox).
    throw new Error('We couldn’t connect. Check your connection and try again.');
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = new Error(data?.error || PROXY_ANSWERS[res.status] || `Something went wrong (${res.status}). Try again in a moment.`);
    error.status = res.status;
    throw error;
  }
  return data;
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
  // `also`: one more address to send it to (kept on the buyer's record); '' removes it; leave it out to change nothing.
  emailPlan: (token, also) => request('/api/me/plan/email', { method: 'POST', body: also === undefined ? {} : { also }, token }),
  saveMoveIn: (token, plan) => request('/api/me/movein', { method: 'PUT', body: plan, token }),
};

// ── admin ─────────────────────────────────────────────────────────────────
export const adminApi = {
  login: (email, password) => request('/api/admin/login', { method: 'POST', body: { email, password } }),
  me: (token) => request('/api/admin/me', { token }),
  communities: (token) => request('/api/admin/communities', { token }),
  community: (token, id) => request(`/api/admin/communities/${encodeURIComponent(id)}`, { token }),
  createCommunity: (token, body) => request('/api/admin/communities', { method: 'POST', body, token }),
  updateCommunity: (token, id, body) =>
    request(`/api/admin/communities/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteCommunity: (token, id) =>
    request(`/api/admin/communities/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  checkRates: (token, id) =>
    request(`/api/admin/communities/${encodeURIComponent(id)}/rates/check`, { method: 'POST', body: {}, token }),
  createHome: (token, communityId, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/homes`, { method: 'POST', body, token }),
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
  downloadLeadMismo: async (token, leadId) => {
    const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}/mismo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Could not build the file (${res.status})`);
    const disposition = res.headers.get('Content-Disposition') || '';
    const name = /filename="([^"]+)"/.exec(disposition)?.[1] || 'lead-mismo34.xml';
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return name;
  },
  createResource: (token, communityId, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/resources`, { method: 'POST', body, token }),
  updateResource: (token, id, body) =>
    request(`/api/admin/resources/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
  deleteResource: (token, id) =>
    request(`/api/admin/resources/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  deletePhoto: (token, id) => request(`/api/admin/photos/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
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
  lead: (token, id) => request(`/api/admin/leads/${encodeURIComponent(id)}`, { token }),
  updateLead: (token, id, body) => request(`/api/admin/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
};
