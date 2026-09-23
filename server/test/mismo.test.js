import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMismo34, mismoFilename, splitLocation, splitName } from '../lib/mismo.js';

const lead = {
  id: 'l_abc123',
  name: 'Dana Reyes',
  email: 'dana@test.co',
  phone: '(801) 555-0114',
  savedHomeIds: ['h1', 'h2'],
  moveIn: { homeId: 'h1', targetDate: '2027-03-01', leaseEnd: '2027-02-01', payMethod: 'loan' },
};
const community = { name: 'Willow Creek', location: 'Lehi, Utah' };
const home = { id: 'h1', name: 'The Cedar', price: 519900, lotNumber: 'Lot 14' };

test('a name splits into the parts a loan file wants', () => {
  assert.deepEqual(splitName('Dana Reyes'), { first: 'Dana', last: 'Reyes' });
  // A middle name stays with the first rather than being dropped into a Middle
  // element we cannot be sure is one.
  assert.deepEqual(splitName('Mary Anne Reyes'), { first: 'Mary Anne', last: 'Reyes' });
  // One word is a surname: an importer matching on surname finds it, where
  // putting it in first name would leave surname blank.
  assert.deepEqual(splitName('Cher'), { first: '', last: 'Cher' });
  assert.deepEqual(splitName('  Dana   Reyes  '), { first: 'Dana', last: 'Reyes' });
  assert.deepEqual(splitName(''), { first: '', last: '' });
  assert.deepEqual(splitName(undefined), { first: '', last: '' });
});

test('a typed location becomes a city and a real state code, or nothing', () => {
  assert.deepEqual(splitLocation('Lehi, Utah'), { city: 'Lehi', state: 'UT' });
  assert.deepEqual(splitLocation('Lehi, UT'), { city: 'Lehi', state: 'UT' });
  assert.deepEqual(splitLocation('Lehi, ut'), { city: 'Lehi', state: 'UT' });
  // A wrong state on a loan file is worse than a missing one, so an
  // unrecognisable one is left out rather than guessed at.
  assert.deepEqual(splitLocation('Lehi, Utahh'), { city: 'Lehi', state: '' });
  assert.deepEqual(splitLocation('Somewhere'), { city: 'Somewhere', state: '' });
  assert.deepEqual(splitLocation(''), { city: '', state: '' });
});

test('the file carries the buyer, the property and the price they chose', () => {
  const xml = buildMismo34({ lead, community, home, now: new Date('2026-09-23T12:00:00Z') });

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /MISMOReferenceModelIdentifier="3\.4\.0322"/);
  assert.match(xml, /<DataVersionIdentifier>3\.4\.0322<\/DataVersionIdentifier>/);

  assert.match(xml, /<FirstName>Dana<\/FirstName>/);
  assert.match(xml, /<LastName>Reyes<\/LastName>/);
  assert.match(xml, /<ContactPointEmailValue>dana@test\.co<\/ContactPointEmailValue>/);
  // Digits only: the shape a person typed is not what an importer parses.
  assert.match(xml, /<ContactPointTelephoneValue>8015550114<\/ContactPointTelephoneValue>/);

  assert.match(xml, /<CityName>Lehi<\/CityName>/);
  assert.match(xml, /<StateCode>UT<\/StateCode>/);
  assert.match(xml, /<AddressLineText>Lot 14<\/AddressLineText>/);
  assert.match(xml, /<SalesContractAmount>519900<\/SalesContractAmount>/);
  assert.match(xml, /<LoanPurposeType>Purchase<\/LoanPurposeType>/);
  assert.match(xml, /<PartyRoleType>Borrower<\/PartyRoleType>/);

  assert.match(xml, /Wants to be moved in by 2027-03-01/);
  assert.match(xml, /Current lease ends 2027-02-01/);

  // The promise the module makes about what it does not send. Matched as
  // elements rather than as words: the file's own note says "no income, assets
  // or credit collected", and a substring check would trip on that disclaimer
  // while a real <CurrentIncomeMonthlyTotalAmount> slipped past a later edit.
  for (const pattern of [
    /<[A-Za-z]*Income[A-Za-z]*>/, /<[A-Za-z]*Credit[A-Za-z]*Score[A-Za-z]*>/,
    /<TaxpayerIdentifier[A-Za-z]*>/, /<[A-Za-z]*SocialSecurity[A-Za-z]*>/,
    /<BorrowerBirthDate>/, /<[A-Za-z]*Asset[A-Za-z]*>/,
  ]) {
    assert.ok(!pattern.test(xml), `${pattern} must never reach a file this app builds`);
  }
});

test('a lead with nothing but a name still produces a valid file', () => {
  const bare = buildMismo34({ lead: { id: 'l_1', name: 'Cher' }, community: { name: 'X' } });
  assert.match(bare, /<LastName>Cher<\/LastName>/);
  // Empty elements are worse than absent ones: an importer reads <CityName></CityName>
  // as a city that is blank, not a city we never knew.
  assert.ok(!/<CityName><\/CityName>/.test(bare));
  assert.ok(!/<SalesContractAmount>/.test(bare), 'no home chosen means no price to claim');
  assert.ok(!/<AddressLineText>/.test(bare));
  assert.match(bare, /<\/MESSAGE>$/);
});

test('a name that would break the XML is escaped, not emitted raw', () => {
  const xml = buildMismo34({
    lead: { id: 'l_2', name: 'Bob <script> & Sons', email: 'a"b@test.co', phone: '' },
    community: { name: 'Tom & Jerry\'s Place', location: 'Lehi, Utah' },
    home: { name: 'The <b>Cedar</b>', price: 100, lotNumber: 'Lot & 3' },
  });
  assert.ok(!xml.includes('<script>'), 'the tag must not survive into the document');
  assert.match(xml, /&lt;script&gt;/);
  // The name splits at the last space, so the ampersand ends the first name and
  // "Sons" is the surname — they are never adjacent in the document.
  assert.match(xml, /<FirstName>Bob &lt;script&gt; &amp;<\/FirstName>/);
  assert.match(xml, /<LastName>Sons<\/LastName>/);
  assert.match(xml, /Lot &amp; 3/);
  assert.match(xml, /Tom &amp; Jerry&apos;s Place/);
  assert.ok(!/&(?!(amp|lt|gt|quot|apos);)/.test(xml), 'every bare ampersand is escaped');
});

test('the filename is one a loan officer can find again', () => {
  assert.equal(mismoFilename(lead), 'Reyes-Dana-l_abc123-mismo34.xml');
  // A name full of characters a filesystem dislikes still yields a usable name.
  assert.equal(mismoFilename({ id: 'l_9', name: 'Ann/Marie O\'Brien' }), 'OBrien-AnnMarie-l_9-mismo34.xml');
  assert.equal(mismoFilename({ id: 'l_3', name: '' }), 'lead-l_3-mismo34.xml');
});
