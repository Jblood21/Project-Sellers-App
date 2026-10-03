import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { AGENT_TEXT_MAX, MAX_AGENTS } from '../../shared/domain.js';
import { GIF, PNG, backends, startBackend } from './fixtures/harness.js';

// A minimal SVG with a script in it: the thing the upload route must never keep.
const SVG = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
).toString('base64')}`;

for (const kind of backends()) {
  describe(`realtors and community logos (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;

    before(async () => {
      app = await startBackend(kind, 'agents_api');
      ({ api, token } = app);
      const made = await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Agent Ridge' } });
      cid = made.body.id;
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const addAgent = (body = { name: 'Dana Cruz' }) =>
      admin(`/communities/${cid}/agents`, { method: 'POST', body });
    const clearAgents = async () => {
      const { body } = await admin(`/communities/${cid}`);
      for (const a of body.agents) await admin(`/agents/${a.id}`, { method: 'DELETE' });
    };

    test('every new admin route refuses an anonymous caller', async () => {
      const routes = [
        ['POST', `/communities/${cid}/agents`], ['PATCH', '/agents/a_x'], ['DELETE', '/agents/a_x'],
        ['POST', '/agents/a_x/photo'], ['POST', '/agents/a_x/logo'],
        ['GET', '/guides/g_x'], ['POST', `/communities/${cid}/guides`],
        ['POST', `/communities/${cid}/guides/restore-defaults`], ['PATCH', '/guides/g_x'],
        ['DELETE', '/guides/g_x'], ['POST', '/guides/g_x/image'], ['DELETE', '/guides/g_x/image'],
        ['POST', `/communities/${cid}/photos/logo`], ['POST', `/communities/${cid}/photos/logolight`],
        ['POST', `/communities/${cid}/photos/lenderlogo`], ['PATCH', `/communities/${cid}`],
      ];
      for (const [method, path] of routes) {
        const res = await api(`/api/admin${path}`, { method, body: {} });
        assert.equal(res.status, 401, `${method} ${path} must require a sign-in`);
      }
    });

    test('an agent is created with defaults and carries no images yet', async () => {
      const res = await addAgent({ name: '  Dana Cruz ', brokerage: 'Summit Realty', licenseNo: '12345' });
      assert.equal(res.status, 201);
      assert.match(res.body.id, /^a_/);
      assert.equal(res.body.name, 'Dana Cruz', 'trimmed');
      assert.equal(res.body.licenseState, 'UT', 'defaults to Utah');
      assert.equal(res.body.photo, null);
      assert.equal(res.body.logo, null);
      assert.equal(res.body.communityId, cid);
      await clearAgents();
    });

    test('a name is required and every field is validated on the server', async () => {
      const refuse = async (body, pattern) => {
        const res = await addAgent(body);
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.match(res.body.error, pattern);
      };
      await refuse({}, /name/i);
      await refuse({ name: '   ' }, /name/i);
      await refuse({ name: 'A', email: 'not-an-email' }, /email/i);
      await refuse({ name: 'A', email: 'two words@x.co' }, /email/i);
      await refuse({ name: 'A', website: 'javascript:alert(1)' }, /website/i);
      await refuse({ name: 'A', website: 'data:text/html,<script>x</script>' }, /website/i);
      await refuse({ name: 'A', licenseState: 'Utah' }, /state/i);
      await refuse({ name: 'A', licenseState: 'U1' }, /state/i);
      await refuse({ name: 'x'.repeat(AGENT_TEXT_MAX.name + 1) }, /name.*too long/i);
      await refuse({ name: 'A', brokerage: 'b'.repeat(AGENT_TEXT_MAX.brokerage + 1) }, /brokerage/i);
      await refuse({ name: 'A', licenseNo: '1'.repeat(AGENT_TEXT_MAX.licenseNo + 1) }, /license/i);
      await refuse({ name: 'A', phone: '1'.repeat(AGENT_TEXT_MAX.phone + 1) }, /phone/i);
      await refuse({ name: 'A', email: `${'e'.repeat(AGENT_TEXT_MAX.email)}@x.co` }, /email/i);
      await refuse({ name: 'A', website: `https://x.co/${'w'.repeat(AGENT_TEXT_MAX.website)}` }, /website/i);
      assert.equal((await admin(`/communities/${cid}`)).body.agents.length, 0, 'nothing was stored');
    });

    test('a website is normalised to a real link and the state is upper-cased', async () => {
      const res = await addAgent({
        name: 'Lee', website: 'example.com/lee', licenseState: 'ut', email: 'lee@example.com',
      });
      assert.equal(res.status, 201);
      assert.equal(res.body.website, 'https://example.com/lee');
      assert.equal(res.body.licenseState, 'UT');
      const blank = await admin(`/agents/${res.body.id}`, { method: 'PATCH', body: { licenseState: '', website: '' } });
      assert.equal(blank.body.licenseState, '', 'a blank state is allowed');
      assert.equal(blank.body.website, '');
      await clearAgents();
    });

    test('a fifth realtor is refused with the exact message, and a freed slot reopens', async () => {
      for (let i = 1; i <= MAX_AGENTS; i += 1) {
        assert.equal((await addAgent({ name: `Agent ${i}` })).status, 201);
      }
      const fifth = await addAgent({ name: 'Agent 5' });
      assert.equal(fifth.status, 400);
      assert.equal(fifth.body.error, 'Up to 4 realtors per community.');
      const { body } = await admin(`/communities/${cid}`);
      assert.deepEqual(body.agents.map((a) => a.name), ['Agent 1', 'Agent 2', 'Agent 3', 'Agent 4']);
      assert.deepEqual(body.agents.map((a) => a.position), [0, 1, 2, 3], 'listed in the order added');

      await admin(`/agents/${body.agents[1].id}`, { method: 'DELETE' });
      assert.equal((await addAgent({ name: 'Agent 6' })).status, 201, 'removing one makes room');
      await clearAgents();
    });

    test('the cap is per community', async () => {
      const other = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Other Ridge' } })).body.id;
      for (let i = 0; i < MAX_AGENTS; i += 1) await addAgent({ name: `Agent ${i}` });
      const res = await admin(`/communities/${other}/agents`, { method: 'POST', body: { name: 'Elsewhere' } });
      assert.equal(res.status, 201, 'a full community does not block a different one');
      await clearAgents();
    });

    test('an agent can be edited, and a bad edit changes nothing', async () => {
      const agent = (await addAgent({ name: 'Dana', brokerage: 'Old Realty', phone: '801-555-0100' })).body;
      const ok = await admin(`/agents/${agent.id}`, {
        method: 'PATCH', body: { brokerage: 'New Realty', email: 'dana@new.co', licenseNo: 'RE-9' },
      });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.brokerage, 'New Realty');
      assert.equal(ok.body.email, 'dana@new.co');
      assert.equal(ok.body.phone, '801-555-0100', 'a field not sent is left alone');

      for (const bad of [{ website: 'javascript:alert(1)' }, { email: 'nope' }, { name: ' ' }, { licenseState: 'USA' }]) {
        const res = await admin(`/agents/${agent.id}`, { method: 'PATCH', body: bad });
        assert.equal(res.status, 400, JSON.stringify(bad));
      }
      const after = (await admin(`/communities/${cid}`)).body.agents[0];
      assert.equal(after.name, 'Dana');
      assert.equal(after.website, '');
      assert.equal(after.email, 'dana@new.co');

      assert.equal((await admin('/agents/a_missing', { method: 'PATCH', body: { name: 'x' } })).status, 404);
      await clearAgents();
    });

    test('a photo and a logo each replace rather than stack', async () => {
      const agent = (await addAgent({ name: 'Dana' })).body;
      const first = await admin(`/agents/${agent.id}/photo`, { method: 'POST', body: { dataUrl: GIF } });
      assert.equal(first.status, 201);
      const second = await admin(`/agents/${agent.id}/photo`, { method: 'POST', body: { dataUrl: PNG } });
      assert.equal(second.status, 201);
      assert.notEqual(second.body.id, first.body.id);
      await admin(`/agents/${agent.id}/logo`, { method: 'POST', body: { dataUrl: GIF } });
      await admin(`/agents/${agent.id}/logo`, { method: 'POST', body: { dataUrl: PNG } });

      assert.equal((await api(`/api/photos/${first.body.id}`)).status, 404, 'the replaced portrait is gone');
      const { body } = await admin(`/communities/${cid}`);
      const [shown] = body.agents;
      assert.equal(shown.photo.id, second.body.id);
      assert.equal(shown.photo.url, `/api/photos/${second.body.id}`);
      assert.ok(shown.logo.id, 'and the logo is set');
      assert.notEqual(shown.logo.id, shown.photo.id, 'portrait and logo are separate images');
      assert.equal((await app.store.listAgentPhotos(agent.id, 'agent')).length, 1);
      assert.equal((await app.store.listAgentPhotos(agent.id, 'agentlogo')).length, 1);

      const served = await api(`/api/photos/${second.body.id}`, { raw: true });
      assert.equal(served.status, 200);
      assert.equal(served.headers.get('content-type'), 'image/png');
      await clearAgents();
    });

    test('an agent image can be removed on its own with the existing photo route', async () => {
      const agent = (await addAgent({ name: 'Dana' })).body;
      const photo = (await admin(`/agents/${agent.id}/photo`, { method: 'POST', body: { dataUrl: GIF } })).body;
      await admin(`/agents/${agent.id}/logo`, { method: 'POST', body: { dataUrl: GIF } });
      assert.equal((await admin(`/photos/${photo.id}`, { method: 'DELETE' })).status, 204);
      const [shown] = (await admin(`/communities/${cid}`)).body.agents;
      assert.equal(shown.photo, null);
      assert.ok(shown.logo, 'the logo is untouched');
      await clearAgents();
    });

    test('deleting an agent deletes their images', async () => {
      const agent = (await addAgent({ name: 'Dana' })).body;
      const photo = (await admin(`/agents/${agent.id}/photo`, { method: 'POST', body: { dataUrl: GIF } })).body;
      const logo = (await admin(`/agents/${agent.id}/logo`, { method: 'POST', body: { dataUrl: GIF } })).body;
      assert.equal((await api(`/api/photos/${photo.id}`)).status, 200);

      assert.equal((await admin(`/agents/${agent.id}`, { method: 'DELETE' })).status, 204);
      assert.equal((await api(`/api/photos/${photo.id}`)).status, 404, 'portrait removed');
      assert.equal((await api(`/api/photos/${logo.id}`)).status, 404, 'logo removed');
      assert.equal(await app.store.getAgent(agent.id), null);
    });

    test('SVG, oversized and non-image uploads are refused for every new image slot', async () => {
      const agent = (await addAgent({ name: 'Dana' })).body;
      const big = `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')}`;
      const targets = [
        `/agents/${agent.id}/photo`, `/agents/${agent.id}/logo`,
        `/communities/${cid}/photos/logo`, `/communities/${cid}/photos/logolight`,
        `/communities/${cid}/photos/lenderlogo`,
      ];
      for (const path of targets) {
        for (const [label, dataUrl] of [
          ['svg', SVG], ['oversized', big], ['pdf', 'data:application/pdf;base64,JVBERi0='],
          ['html', 'data:text/html;base64,PGgxPng8L2gxPg=='], ['garbage', 'not a data url'],
        ]) {
          const res = await admin(path, { method: 'POST', body: { dataUrl } });
          assert.equal(res.status, 400, `${label} to ${path}`);
        }
        assert.equal((await admin(path, { method: 'POST', body: { url: 'http://x.co/a.png' } })).status, 400, 'http links are refused');
      }
      const { body } = await admin(`/communities/${cid}`);
      assert.equal(body.agents[0].photo, null);
      assert.equal(body.logo, null, 'nothing was stored by any of them');
      await clearAgents();
    });

    test('an uploaded image is served as its raster type and cannot be sniffed into a page', async () => {
      const agent = (await addAgent({ name: 'Dana' })).body;
      const photo = (await admin(`/agents/${agent.id}/photo`, { method: 'POST', body: { dataUrl: GIF } })).body;
      const served = await api(`/api/photos/${photo.id}`, { raw: true });
      assert.equal(served.headers.get('content-type'), 'image/gif');
      assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
      assert.match(served.headers.get('content-security-policy'), /sandbox/);
      assert.match(served.headers.get('content-security-policy'), /default-src 'none'/);
      await clearAgents();
    });

    test('an SVG that reached the database anyway is not served as an image', async () => {
      // Nothing can store one through the API. This plants a row directly, to
      // prove the serving route does not rely on the upload check alone.
      const planted = await app.store.addPhoto({
        communityId: cid, kind: 'logo', contentType: 'image/svg+xml',
        data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64'),
      });
      const served = await api(`/api/photos/${planted.id}`, { raw: true });
      assert.notEqual(served.headers.get('content-type'), 'image/svg+xml');
      assert.equal(served.headers.get('content-type'), 'application/octet-stream');
      await app.store.deletePhoto(planted.id);
    });

    test('the development logos replace, appear for the admin and reach buyers as URLs', async () => {
      const set = (slot, dataUrl) =>
        admin(`/communities/${cid}/photos/${slot}`, { method: 'POST', body: { dataUrl } });
      const first = (await set('logo', GIF)).body;
      const second = (await set('logo', PNG)).body;
      const light = (await set('logolight', GIF)).body;
      const lender = (await set('lenderlogo', PNG)).body;

      assert.equal((await api(`/api/photos/${first.id}`)).status, 404, 'the old logo is replaced, not stacked');
      assert.equal((await app.store.listCommunityPhotos(cid, 'logo')).length, 1);

      const seen = (await admin(`/communities/${cid}`)).body;
      assert.equal(seen.logo.id, second.id);
      assert.equal(seen.logoLight.id, light.id);
      assert.equal(seen.lenderLogo.id, lender.id);
      assert.equal(seen.heroPhoto, null, 'the other slots are untouched');

      const pub = (await api(`/api/c/${cid}`)).body;
      assert.equal(pub.logo, `/api/photos/${second.id}`);
      assert.equal(pub.logoLight, `/api/photos/${light.id}`);
      assert.equal(pub.lenderLogo, `/api/photos/${lender.id}`);

      assert.equal((await admin(`/communities/${cid}/photos/banner`, { method: 'POST', body: { dataUrl: GIF } })).status, 400, 'unknown slots stay refused');
      for (const photo of [second, light, lender]) await admin(`/photos/${photo.id}`, { method: 'DELETE' });
      const cleared = (await api(`/api/c/${cid}`)).body;
      assert.equal(cleared.logo, null);
      assert.equal(cleared.logoLight, null);
      assert.equal(cleared.lenderLogo, null);
    });

    test('the public payload carries realtors with bare image URLs and nothing internal', async () => {
      const agent = (await addAgent({
        name: 'Dana Cruz', brokerage: 'Summit Realty', licenseNo: '12345', licenseState: 'UT',
        phone: '801-555-0100', email: 'dana@sr.co', website: 'https://sr.co',
      })).body;
      const photo = (await admin(`/agents/${agent.id}/photo`, { method: 'POST', body: { dataUrl: GIF } })).body;
      const logo = (await admin(`/agents/${agent.id}/logo`, { method: 'POST', body: { dataUrl: PNG } })).body;
      await addAgent({ name: 'No Images' });

      const { agents } = (await api(`/api/c/${cid}`)).body;
      assert.equal(agents.length, 2);
      assert.deepEqual(agents[0], {
        id: agent.id, name: 'Dana Cruz', brokerage: 'Summit Realty', licenseNo: '12345',
        licenseState: 'UT', phone: '801-555-0100', email: 'dana@sr.co', website: 'https://sr.co/',
        photo: `/api/photos/${photo.id}`, logo: `/api/photos/${logo.id}`,
      });
      assert.equal(agents[1].photo, null);
      assert.equal(agents[1].logo, null);
    });

    test('switching Realtors off empties them from the buyer payload but not the admin', async () => {
      await addAgent({ name: 'Hidden Agent' });
      await admin(`/communities/${cid}`, { method: 'PATCH', body: { features: { agents: false } } });
      assert.deepEqual((await api(`/api/c/${cid}`)).body.agents, []);
      assert.equal((await admin(`/communities/${cid}`)).body.agents.length > 0, true, 'the builder still sees them');
      await admin(`/communities/${cid}`, { method: 'PATCH', body: { features: { agents: true } } });
      assert.ok((await api(`/api/c/${cid}`)).body.agents.length > 0, 'and they come back when switched on');
      await clearAgents();
    });

    test('deleting a community removes its realtors, guides and every image', async () => {
      const made = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Doomed Ridge' } })).body.id;
      const agent = (await admin(`/communities/${made}/agents`, { method: 'POST', body: { name: 'Gone' } })).body;
      const photo = (await admin(`/agents/${agent.id}/photo`, { method: 'POST', body: { dataUrl: GIF } })).body;
      const guide = (await admin(`/communities/${made}/guides`, { method: 'POST', body: { title: 'Gone guide' } })).body;
      const picture = (await admin(`/guides/${guide.id}/image`, { method: 'POST', body: { dataUrl: GIF } })).body;
      const logo = (await admin(`/communities/${made}/photos/logo`, { method: 'POST', body: { dataUrl: GIF } })).body;

      assert.equal((await admin(`/communities/${made}`, { method: 'DELETE' })).status, 204);
      assert.equal(await app.store.getAgent(agent.id), null);
      assert.equal(await app.store.getGuide(guide.id), null);
      assert.equal(await app.store.countAgents(made), 0);
      assert.deepEqual(await app.store.listGuides(made, { includeUnpublished: true }), []);
      for (const id of [photo.id, picture.id, logo.id]) {
        assert.equal((await api(`/api/photos/${id}`)).status, 404, 'its pictures went with it');
      }
      assert.equal((await api(`/api/c/${made}`)).status, 404);
    });
  });
}

// The cap and the positions have to hold when requests overlap, which is what a
// double-click on "Add a realtor" is. Written against both stores: Postgres is
// where an unlocked count-then-insert actually interleaves.
for (const kind of backends()) {
  describe(`realtor limits when requests overlap (${kind} store)`, () => {
    let app;
    let api;
    let token;

    before(async () => {
      app = await startBackend(kind, 'agents_race');
      ({ api, token } = app);
    });
    after(() => app.stop());

    const admin = (path, opts = {}) => api(`/api/admin${path}`, { token, ...opts });
    const newCommunity = async (name) =>
      (await api('/api/admin/communities', { method: 'POST', token, body: { name } })).body.id;
    const add = (id, name) => admin(`/communities/${id}/agents`, { method: 'POST', body: { name } });
    const stored = async (id) => (await admin(`/communities/${id}`)).body.agents;

    test('twelve simultaneous adds leave exactly four realtors, in four distinct positions', async () => {
      const id = await newCommunity('Race Ridge');
      const results = await Promise.all(Array.from({ length: 12 }, (_, i) => add(id, `Agent ${i}`)));
      assert.equal(results.filter((r) => r.status === 201).length, MAX_AGENTS);
      assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 400));
      const agents = await stored(id);
      assert.equal(agents.length, MAX_AGENTS);
      assert.deepEqual(agents.map((a) => a.position), [0, 1, 2, 3]);
    });

    test('two adds racing for the last place give it to one of them, every time', async () => {
      for (let trial = 0; trial < 5; trial += 1) {
        const id = await newCommunity(`Last Place ${trial}`);
        for (let i = 0; i < MAX_AGENTS - 1; i += 1) assert.equal((await add(id, `Agent ${i}`)).status, 201);
        const [a, b] = await Promise.all([add(id, 'Racer A'), add(id, 'Racer B')]);
        assert.deepEqual([a.status, b.status].sort(), [201, 400], `trial ${trial}`);
        assert.equal((await stored(id)).length, MAX_AGENTS, `trial ${trial}`);
      }
    });

    test('a realtor whose position matches another keeps a stable place in the list', async () => {
      const id = await newCommunity('Tie Ridge');
      const made = [];
      // More than two, then the pair whose creation order and id order disagree,
      // so a tie that fell back to either one would show.
      // Ids are random, so on the rare draw that comes out ascending, start over.
      let pair;
      for (let attempt = 0; attempt < 20 && !pair; attempt += 1) {
        for (const a of made.splice(0)) await admin(`/agents/${a.id}`, { method: 'DELETE' });
        for (const name of ['One', 'Two', 'Three', 'Four']) made.push((await add(id, name)).body);
        pair = made.flatMap((g, i) => made.slice(i + 1).filter((h) => g.id > h.id).map((h) => [g, h]))[0];
      }
      assert.ok(pair);
      // The routes allow equal positions, so the tie must break the same way on
      // both stores and must not shift when either agent is edited afterwards.
      await admin(`/agents/${pair[0].id}`, { method: 'PATCH', body: { position: 5 } });
      await admin(`/agents/${pair[1].id}`, { method: 'PATCH', body: { position: 5 } });
      const expected = [pair[0].id, pair[1].id].sort();
      for (const edited of [pair[0], pair[1], pair[0], pair[1]]) {
        await admin(`/agents/${edited.id}`, { method: 'PATCH', body: { brokerage: `Realty ${Math.random()}` } });
        const tied = (await stored(id)).filter((a) => a.position === 5).map((a) => a.id);
        assert.deepEqual(tied, expected);
      }
    });

    test('text that is not text is refused rather than stored as "[object Object]"', async () => {
      const id = await newCommunity('Types Ridge');
      for (const body of [
        { name: { a: 1 } }, { name: 42 }, { name: 'Ok', brokerage: ['x', 'y'] },
        { name: 'Ok', phone: true }, { name: 'Ok', email: {} }, { name: 'Ok', website: ['https://a.co'] },
        { name: 'Ok', licenseState: 7 },
      ]) {
        const res = await admin(`/communities/${id}/agents`, { method: 'POST', body });
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.match(res.body.error, /must be text/);
      }
      assert.equal((await stored(id)).length, 0);
      const agent = (await add(id, 'Real')).body;
      const patched = await admin(`/agents/${agent.id}`, { method: 'PATCH', body: { brokerage: ['x', 'y'] } });
      assert.equal(patched.status, 400);
      assert.equal((await stored(id))[0].brokerage, '');
    });

    test('a NUL character is dropped, and nothing that carries one can stop the server', async () => {
      const id = await newCommunity('Nul Ridge');
      // Postgres throws on a NUL byte. Unhandled, that rejection ends the whole
      // process, so each of these would have taken every other request with it.
      const made = await add(id, 'Da\u0000na');
      assert.equal(made.status, 201);
      assert.equal(made.body.name, 'Dana');
      const settings = await admin(`/communities/${id}`, {
        method: 'PATCH', body: { settings: { lenderName: 'Sum\u0000mit' } },
      });
      assert.equal(settings.status, 200);
      assert.equal(settings.body.settings.lenderName, 'Summit');
      const upload = await admin(`/agents/${made.body.id}/photo`, {
        method: 'POST', body: { dataUrl: `${PNG}\u0000` },
      });
      assert.ok([201, 400].includes(upload.status));
      assert.equal((await api('/api/health')).status, 200, 'the server is still up');
    });

    test('a query the database refuses becomes a 500, not a dead process', async () => {
      // %00 in an id reaches the store as a NUL. Before the async handlers were
      // wrapped, Postgres' error was an unhandled rejection and Node exited.
      const gone = await api('/api/c/a%00b');
      assert.ok([404, 500].includes(gone.status), `got ${gone.status}`);
      const adminGone = await admin('/communities/a%00b');
      assert.ok([404, 500].includes(adminGone.status), `got ${adminGone.status}`);
      const guideGone = await admin('/guides/g_a%00b');
      assert.ok([404, 500].includes(guideGone.status), `got ${guideGone.status}`);
      assert.equal((await api('/api/health')).status, 200, 'the server is still up');
    });
  });
}
