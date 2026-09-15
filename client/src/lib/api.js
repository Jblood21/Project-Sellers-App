const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body === undefined ? {} : JSON_HEADERS),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const error = new Error(data?.error || `Request failed (${res.status})`);
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
  requestTour: (token, time) => request('/api/me/tour', { method: 'POST', body: { time }, token }),
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
  addCommunityPhoto: (token, communityId, kind, body) =>
    request(`/api/admin/communities/${encodeURIComponent(communityId)}/photos/${kind}`, {
      method: 'POST', body, token,
    }),
  deletePhoto: (token, id) => request(`/api/admin/photos/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  leads: (token, communityId) => request(`/api/admin/communities/${encodeURIComponent(communityId)}/leads`, { token }),
  lead: (token, id) => request(`/api/admin/leads/${encodeURIComponent(id)}`, { token }),
  updateLead: (token, id, body) => request(`/api/admin/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body, token }),
};
