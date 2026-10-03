import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

import { COMPLIANCE_DEFAULTS, settingMaxLength } from '../../shared/domain.js';
import { issueLeadToken, issueToken, readLeadToken, readToken } from '../lib/auth.js';
import { originOfRequest } from '../lib/ssr.js';
import { GIF, backends, startBackend } from './fixtures/harness.js';

const bytes = (...values) => Buffer.from(values);
const dataUrl = (type, buffer) => `data:${type};base64,${buffer.toString('base64')}`;

for (const kind of backends()) {
  describe(`hardening (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;
    let leadToken;

    before(async () => {
      app = await startBackend(kind, 'hardening');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Hardening Heights' } })).body.id;
      // The buyer contact gate is open to anyone, so this is a token any visitor can hold.
      const lead = await api(`/api/c/${cid}/leads`, {
        method: 'POST', body: { name: 'Eve Buyer', email: 'eve@example.com', phone: '8015550000' },
      });
      assert.equal(lead.status, 201);
      leadToken = lead.body.token;
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });

    test('a buyer token is not an admin token, on any admin route', async () => {
      // The buyer token is signed with the same secret as the admin one, so the
      // signature alone proves nothing about WHO holds it.
      const routes = [
        ['GET', '/me'], ['GET', '/communities'], ['POST', '/communities'], ['GET', `/communities/${cid}`],
        ['PATCH', `/communities/${cid}`], ['DELETE', `/communities/${cid}`],
        ['GET', `/communities/${cid}/leads`], ['POST', `/communities/${cid}/agents`],
        ['POST', `/communities/${cid}/guides`], ['POST', `/communities/${cid}/photos/logo`],
        ['POST', `/communities/${cid}/guides/restore-defaults`], ['PATCH', '/agents/a_x'], ['GET', '/guides/g_x'],
      ];
      for (const [method, path] of routes) {
        const res = await api(`/api/admin${path}`, { method, token: leadToken, body: {} });
        assert.equal(res.status, 401, `${method} ${path} must refuse a buyer token`);
      }
      // ...and nothing it tried changed anything.
      const settings = (await admin(`/communities/${cid}`)).body.settings;
      assert.equal(settings.lenderNmls, COMPLIANCE_DEFAULTS.lenderNmls);
    });

    test('an admin token is not a buyer token either', async () => {
      assert.equal((await api('/api/me', { token })).status, 401);
      assert.equal((await api('/api/me', { token: leadToken })).status, 200);
    });

    test('tokens carry what they are, and a token from before that was recorded still works', () => {
      const adminToken = issueToken({ id: 'ad_1', email: 'a@b.co' });
      assert.equal(readToken(adminToken).typ, 'admin');
      assert.equal(readLeadToken(adminToken), null);
      assert.equal(readToken(leadToken).typ, 'lead');
      assert.equal(readLeadToken(issueLeadToken({ id: 'l_1', communityId: 'c' })).lead, 'l_1');
    });

    test('a NUL byte or broken escape in an address is a 404 or 400, never a crash or a 500', async () => {
      const paths = [
        '/c/%00/manifest.webmanifest', `/c/${cid}%00/manifest.webmanifest`, '/api/c/%00', '/api/c/%00/slots',
        '/api/c/%00/guides/x', `/api/c/${cid}/guides/%00`, '/api/photos/%00', '/api/communities/%00/rates',
      ];
      for (const path of paths) {
        const res = await api(path, { raw: true });
        assert.equal(res.status, 404, `${path} should be a plain 404`);
      }
      for (const path of ['/guides/%00', '/agents/%00', `/communities/%00`, `/communities/%00/photos/hero`]) {
        for (const method of ['GET', 'PATCH', 'DELETE', 'POST']) {
          const res = await admin(path, { method, body: {} });
          assert.ok([404, 405].includes(res.status) || res.status === 400, `${method} ${path} -> ${res.status}`);
          assert.notEqual(res.status, 500, `${method} ${path} must not be a 500`);
        }
      }
      assert.equal((await admin('/communities/%00/agents', { method: 'POST', body: { name: 'X' } })).status, 404);
      assert.equal((await admin('/communities/%00/guides/restore-defaults', { method: 'POST', body: {} })).status, 404);
      // The server is still up, which is the thing a crash would have ended.
      assert.equal((await api('/api/health')).status, 200);
    });

    test('a malformed escape or body is the caller\'s 400, an oversize one a 413, not our 500', async () => {
      assert.equal((await api('/c/%E0%A4%A/manifest.webmanifest', { raw: true })).status, 400);
      assert.equal((await api('/api/c/%E0%A4%A', { raw: true })).status, 400);
      const base = new URL((await api('/api/health', { raw: true })).url).origin;
      const res = await fetch(`${base}/api/admin/communities/${cid}/agents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{bad',
      });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /could not be read/i);
      const huge = await fetch(`${base}/api/c/${cid}/leads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pad: 'x'.repeat(37 * 1024 * 1024) }),
      });
      assert.equal(huge.status, 413);
    });

    test('responses carry the basic security headers and do not advertise Express', async () => {
      for (const path of ['/api/health', `/c/${cid}`, `/api/c/${cid}`]) {
        const res = await api(path, { raw: true });
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
        assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', path);
        assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
        assert.equal(res.headers.get('x-powered-by'), null, path);
      }
    });

    test('an upload must really be the image it says it is', async () => {
      const route = `/communities/${cid}/photos/lenderlogo`;
      const html = Buffer.from('<html><script>alert(1)</script></html>');
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
      const badNames = {
        'html labelled png': dataUrl('image/png', html),
        'svg labelled png': dataUrl('image/png', svg),
        'zero bytes': 'data:image/png;base64,A',
        'png label on jpeg bytes': dataUrl('image/png', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0)),
        'truncated png': dataUrl('image/png', bytes(0x89, 0x50, 0x4e)),
        'riff but not webp': dataUrl('image/webp', Buffer.from('RIFF\0\0\0\0WAVEfmt ')),
      };
      for (const [name, url] of Object.entries(badNames)) {
        const res = await admin(route, { method: 'POST', body: { dataUrl: url } });
        assert.equal(res.status, 400, `${name} must be refused`);
      }
      const good = {
        gif: GIF,
        jpeg: dataUrl('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)),
        webp: dataUrl('image/webp', Buffer.from('RIFF\x10\0\0\0WEBPVP8 ')),
        png: dataUrl('image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)),
      };
      for (const [name, url] of Object.entries(good)) {
        const res = await admin(route, { method: 'POST', body: { dataUrl: url } });
        assert.equal(res.status, 201, `${name} is a real image and must be accepted`);
      }
    });

    test('a setting must be text or a number: an object is refused, not stored as "[object Object]"', async () => {
      const before = (await admin(`/communities/${cid}`)).body.settings;
      for (const bad of [{ a: 1 }, ['x', 'y'], true]) {
        const res = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { lenderName: bad } } });
        assert.equal(res.status, 400, JSON.stringify(bad));
        assert.match(res.body.error, /text/i);
      }
      const after = (await admin(`/communities/${cid}`)).body.settings;
      assert.equal(after.lenderName, before.lenderName, 'nothing was stored');
      // Numbers are how the rate fields are sent from the Setup form, and null clears.
      const ok = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { rateConv: 6.5, dpaProgram: null } } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.settings.rateConv, '6.5');
    });

    test('only the compliance copy is capped at its length: an older, longer setting survives a save', async () => {
      const long = 'a'.repeat(616);
      // A value saved before the cap existed: written to the store directly, as an old row would be.
      const community = await app.store.getCommunity(cid);
      await app.store.updateCommunity(cid, { settings: { ...community.settings, dpaProgram: long } });
      const res = await admin(`/communities/${cid}`, { method: 'PATCH', body: { settings: { dpaProgram: long, hoaMo: '50' } } });
      assert.equal(res.status, 200);
      assert.equal(res.body.settings.dpaProgram.length, 616, 'the legacy setting is left alone');
      // ...while the printed copy is still cut at its own cap.
      const cut = await admin(`/communities/${cid}`, {
        method: 'PATCH', body: { settings: { lenderName: 'n'.repeat(2000), complianceNotOffer: 'z'.repeat(9000) } },
      });
      assert.equal(cut.body.settings.lenderName.length, settingMaxLength('lenderName'));
      assert.equal(cut.body.settings.complianceNotOffer.length, settingMaxLength('complianceNotOffer'));
    });
  });
}

describe('postgres reads of picture bytes', { skip: !process.env.TEST_DATABASE_URL }, () => {
  let app;
  let api;
  let token;
  let cid;

  before(async () => {
    app = await startBackend('postgres', 'hardening_bytes');
    ({ api, token } = app);
    cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Byte Bluffs' } })).body.id;
    const agent = (await api(`/api/admin/communities/${cid}/agents`, { method: 'POST', token, body: { name: 'Dana' } })).body;
    await api(`/api/admin/agents/${agent.id}/photo`, { method: 'POST', token, body: { dataUrl: GIF } });
    await api(`/api/admin/communities/${cid}/photos/logo`, { method: 'POST', token, body: { dataUrl: GIF } });
    const guide = (await api(`/api/admin/communities/${cid}`, { token })).body.guides[0];
    await api(`/api/admin/guides/${guide.id}/image`, { method: 'POST', token, body: { dataUrl: GIF } });
  });
  after(() => app.stop());

  test('listing pictures for a page never selects the image bytes', async () => {
    const seen = [];
    const original = pg.Pool.prototype.query;
    pg.Pool.prototype.query = function spy(text, ...rest) {
      if (typeof text === 'string') seen.push(text);
      return original.call(this, text, ...rest);
    };
    try {
      assert.equal((await api(`/api/c/${cid}`)).status, 200);
      assert.equal((await api(`/api/admin/communities/${cid}`, { token })).status, 200);
    } finally {
      pg.Pool.prototype.query = original;
    }
    const photoReads = seen.filter((sql) => /FROM photos/i.test(sql) && !/count\(|max\(|DELETE/i.test(sql));
    assert.ok(photoReads.length > 0, 'the spy saw the photo queries');
    for (const sql of photoReads) {
      assert.doesNotMatch(sql, /SELECT\s+\*/i, `selects every column, bytes included: ${sql.replace(/\s+/g, ' ')}`);
      assert.doesNotMatch(sql, /\bdata\b/i, `selects the bytes: ${sql.replace(/\s+/g, ' ')}`);
    }
  });
});

describe('originOfRequest', () => {
  const req = (headers, protocol = 'http') => ({ protocol, get: (name) => headers[name.toLowerCase()] });
  const saved = process.env.PUBLIC_ORIGIN;
  after(() => {
    if (saved === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = saved;
  });

  test('a configured PUBLIC_ORIGIN wins over whatever Host the request claims', () => {
    process.env.PUBLIC_ORIGIN = 'https://app.example.com/';
    assert.equal(originOfRequest(req({ host: 'evil.example', 'x-forwarded-host': 'evil.example' })), 'https://app.example.com');
    assert.equal(originOfRequest(req({})), 'https://app.example.com', 'even with no Host at all');
  });

  test('a PUBLIC_ORIGIN that is not an http(s) origin is ignored, not trusted', () => {
    for (const bad of ['javascript:alert(1)', 'not a url', 'ftp://a.example', '"><script>']) {
      process.env.PUBLIC_ORIGIN = bad;
      assert.equal(originOfRequest(req({ host: 'a.test' })), 'http://a.test', bad);
    }
  });

  test('unset, the request decides, as in development', () => {
    delete process.env.PUBLIC_ORIGIN;
    assert.equal(originOfRequest(req({ host: 'a.test' })), 'http://a.test');
  });
});
