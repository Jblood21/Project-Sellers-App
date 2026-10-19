import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { HOME_HEADLINE_MAX, HOME_SUBHEAD_MAX } from '../../shared/compliance.js';
import { DEFAULT_SETTINGS, homeGreeting, settingMaxLength } from '../../shared/domain.js';
import { backends, startBackend } from './fixtures/harness.js';

describe('the home screen heading in the builder\'s own words', () => {
  test('blank keeps the layout\'s own wording: both come back empty', () => {
    assert.equal(DEFAULT_SETTINGS.homeHeadline, '');
    assert.equal(DEFAULT_SETTINGS.homeSubhead, '');
    assert.deepEqual(homeGreeting(DEFAULT_SETTINGS, { firstName: 'Dana', community: 'Willow Creek' }), { headline: '', subhead: '' });
    assert.deepEqual(homeGreeting(undefined), { headline: '', subhead: '' });
    assert.deepEqual(homeGreeting({ homeHeadline: '   ', homeSubhead: '\n' }), { headline: '', subhead: '' });
  });

  test('{name} is the buyer\'s first name, "there" without one; {community} is the development; anything else is left as typed', () => {
    const settings = { homeHeadline: 'Welcome home, {name}', homeSubhead: 'See what fits you at {community}. {oops}' };
    assert.deepEqual(homeGreeting(settings, { firstName: 'Dana', community: 'Willow Creek' }), {
      headline: 'Welcome home, Dana', subhead: 'See what fits you at Willow Creek. {oops}',
    });
    assert.equal(homeGreeting(settings, { firstName: '  ', community: 'Willow Creek' }).headline, 'Welcome home, there');
    assert.equal(homeGreeting({ homeHeadline: 'Plain words' }, {}).headline, 'Plain words');
  });

  test('kept short: a heading and a line, not a page', () => {
    assert.equal(settingMaxLength('homeHeadline'), HOME_HEADLINE_MAX);
    assert.equal(settingMaxLength('homeSubhead'), HOME_SUBHEAD_MAX);
    assert.ok(HOME_HEADLINE_MAX <= 120 && HOME_SUBHEAD_MAX <= 300);
  });
});

for (const kind of backends()) {
  describe(`saving the home screen heading (${kind} store)`, () => {
    let app;
    let api;
    let token;
    let cid;

    before(async () => {
      app = await startBackend(kind, 'home_greeting');
      ({ api, token } = app);
      cid = (await api('/api/admin/communities', { method: 'POST', token, body: { name: 'Greeting Grove' } })).body.id;
    });
    after(async () => {
      await app.stop();
    });

    const save = (settings) => api(`/api/admin/communities/${cid}`, { method: 'PATCH', token, body: { settings } });
    const buyerSees = async () => (await api(`/api/c/${cid}`)).body.settings;

    test('a new community starts blank, and buyers are sent the blanks', async () => {
      const settings = await buyerSees();
      assert.equal(settings.homeHeadline, '');
      assert.equal(settings.homeSubhead, '');
    });

    test('what the builder types is stored trimmed and sent to buyers', async () => {
      const res = await save({ homeHeadline: '  Hi {name}, welcome to {community}  ', homeSubhead: ' Pick a home and see your payment. ' });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.settings.homeHeadline, 'Hi {name}, welcome to {community}');
      const settings = await buyerSees();
      assert.equal(settings.homeHeadline, 'Hi {name}, welcome to {community}');
      assert.equal(settings.homeSubhead, 'Pick a home and see your payment.');
    });

    test('too long is cut at the limit; emptied goes back to the layout\'s own words', async () => {
      const res = await save({ homeHeadline: 'H'.repeat(500), homeSubhead: 'S'.repeat(900) });
      assert.equal(res.status, 200);
      assert.equal(res.body.settings.homeHeadline.length, HOME_HEADLINE_MAX);
      assert.equal(res.body.settings.homeSubhead.length, HOME_SUBHEAD_MAX);
      const cleared = await save({ homeHeadline: '', homeSubhead: '' });
      assert.equal(cleared.body.settings.homeHeadline, '');
      assert.equal((await buyerSees()).homeSubhead, '');
    });

    test('anything but text is refused', async () => {
      const res = await save({ homeHeadline: { evil: true } });
      assert.equal(res.status, 400);
    });
  });
}
