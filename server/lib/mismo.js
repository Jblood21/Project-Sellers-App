/**
 * A MISMO v3.4 (ULAD/URLA) file for one lead, so a buyer who walked a community
 * can be handed to a loan officer without anyone retyping them.
 *
 * Scope is deliberate and narrow: contact details, the property they are looking
 * at, and what their own plan says. This app is a marketing PWA, not a 1003 —
 * it never asks for an SSN, a date of birth, employment or assets, and it should
 * not start. So this produces a prospect record an LO opens and works from, not
 * a complete application. Everything it does write is a value a person actually
 * gave us or a home they actually saved; nothing here is inferred or padded to
 * make the file look fuller than the data behind it.
 *
 * The one number that is real: the sales price, taken from the home the buyer
 * saved. Income, down payment and credit range are NOT here — the calculators
 * keep those on the buyer's own phone and the server never receives them.
 */

/** XML text, with the five characters that would otherwise end the document. */
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** An element, or nothing at all when there is no value — MISMO prefers an
 *  absent element to an empty one, and so does every importer. */
const tag = (name, value) => {
  const text = String(value ?? '').trim();
  return text ? `<${name}>${esc(text)}</${name}>` : '';
};

/**
 * "Dana Reyes" -> first Dana, last Reyes. The app asks for one name field
 * because asking a buyer to split it is friction for no gain, so the split
 * happens here: everything before the last space is the first name, which keeps
 * "Mary Anne Reyes" intact rather than losing a middle name to a Middle element
 * we cannot be sure of. A single word is a last name — an importer matching on
 * surname finds it, where putting it in first name leaves surname blank.
 */
export function splitName(full) {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: '', last: parts[0] };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/**
 * "Lehi, Utah" -> city Lehi, state UT. The community's location is free text a
 * builder typed, so this reads what it can and leaves the rest out rather than
 * guessing: a wrong state on a loan file is worse than a missing one.
 */
const STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

export function splitLocation(location) {
  const [rawCity, rawState] = String(location ?? '').split(',').map((s) => s.trim());
  const city = rawCity || '';
  const key = (rawState || '').toLowerCase();
  const state = STATES[key] || (/^[A-Za-z]{2}$/.test(rawState || '') ? rawState.toUpperCase() : '');
  return { city, state };
}

/** Digits only: MISMO wants a bare phone, not the shape a person typed it in. */
const digits = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * Build the file.
 *
 * `home` is the home the buyer's move-in plan names, or failing that the first
 * one they starred — whichever it is, it is a home they chose, which is why its
 * price can be written as the sales price.
 */
export function buildMismo34({ lead, community, home = null, now = new Date() }) {
  const { first, last } = splitName(lead?.name);
  const { city, state } = splitLocation(community?.location);
  const phone = digits(lead?.phone);
  const cash = lead?.moveIn?.payMethod === 'cash';

  // A lot number is not a street address, but it is what identifies the parcel
  // in a new-construction community before an address is assigned, so it goes
  // in the address line where an LO will look for it.
  const street = home?.lotNumber ? `${home.lotNumber}` : '';

  const notes = [
    community?.name ? `Community: ${community.name}` : '',
    home?.name ? `Home: ${home.name}` : '',
    lead?.moveIn?.targetDate ? `Wants to be moved in by ${lead.moveIn.targetDate}` : '',
    lead?.moveIn?.leaseEnd ? `Current lease ends ${lead.moveIn.leaseEnd}` : '',
    (lead?.savedHomeIds?.length ?? 0) > 1 ? `Saved ${lead.savedHomeIds.length} homes` : '',
    'Source: Cornerpost community app. Contact and plan only — no income, assets or credit collected.',
  ].filter(Boolean).join(' | ');

  const body = `<MESSAGE xmlns="http://www.mismo.org/residential/2009/schemas" xmlns:xlink="http://www.w3.org/1999/xlink" MISMOReferenceModelIdentifier="3.4.0322">
  <ABOUT_VERSIONS>
    <ABOUT_VERSION>
      <CreatedDatetime>${esc(now.toISOString())}</CreatedDatetime>
      <DataVersionIdentifier>3.4.0322</DataVersionIdentifier>
    </ABOUT_VERSION>
  </ABOUT_VERSIONS>
  <DEAL_SETS>
    <DEAL_SET>
      <DEALS>
        <DEAL>
          <COLLATERALS>
            <COLLATERAL>
              <SUBJECT_PROPERTY>
                <ADDRESS>
                  ${tag('AddressLineText', street)}
                  ${tag('CityName', city)}
                  <CountryCode>US</CountryCode>
                  ${tag('StateCode', state)}
                </ADDRESS>
                <PROPERTY_DETAIL>
                  <PropertyEstateType>FeeSimple</PropertyEstateType>
                  <PropertyUsageType>PrimaryResidence</PropertyUsageType>
                </PROPERTY_DETAIL>
                ${home?.price ? `<SALES_CONTRACTS>
                  <SALES_CONTRACT>
                    <SalesContractAmount>${esc(Math.round(home.price))}</SalesContractAmount>
                  </SALES_CONTRACT>
                </SALES_CONTRACTS>` : ''}
              </SUBJECT_PROPERTY>
            </COLLATERAL>
          </COLLATERALS>
          <LOANS>
            <LOAN LoanRoleType="SubjectLoan">
              <TERMS_OF_LOAN>
                <LoanPurposeType>Purchase</LoanPurposeType>
                ${cash ? '<MortgageType>Other</MortgageType>' : ''}
              </TERMS_OF_LOAN>
            </LOAN>
          </LOANS>
          <PARTIES>
            <PARTY>
              <INDIVIDUAL>
                <CONTACT_POINTS>
                  ${lead?.email ? `<CONTACT_POINT>
                    <CONTACT_POINT_EMAIL>
                      <ContactPointEmailValue>${esc(lead.email)}</ContactPointEmailValue>
                    </CONTACT_POINT_EMAIL>
                    <CONTACT_POINT_DETAIL>
                      <ContactPointRoleType>Home</ContactPointRoleType>
                    </CONTACT_POINT_DETAIL>
                  </CONTACT_POINT>` : ''}
                  ${phone ? `<CONTACT_POINT>
                    <CONTACT_POINT_TELEPHONE>
                      <ContactPointTelephoneValue>${esc(phone)}</ContactPointTelephoneValue>
                    </CONTACT_POINT_TELEPHONE>
                    <CONTACT_POINT_DETAIL>
                      <ContactPointRoleType>Mobile</ContactPointRoleType>
                    </CONTACT_POINT_DETAIL>
                  </CONTACT_POINT>` : ''}
                </CONTACT_POINTS>
                <NAME>
                  ${tag('FirstName', first)}
                  ${tag('LastName', last)}
                </NAME>
              </INDIVIDUAL>
              <ROLES>
                <ROLE>
                  <BORROWER>
                    <BORROWER_DETAIL>
                      <BorrowerClassificationType>Primary</BorrowerClassificationType>
                    </BORROWER_DETAIL>
                  </BORROWER>
                  <ROLE_DETAIL>
                    <PartyRoleType>Borrower</PartyRoleType>
                  </ROLE_DETAIL>
                </ROLE>
              </ROLES>
            </PARTY>
          </PARTIES>
          <RELATIONSHIPS/>
        </DEAL>
      </DEALS>
    </DEAL_SET>
  </DEAL_SETS>
  <DOCUMENT_SETS>
    <DOCUMENT_SET>
      <DOCUMENTS>
        <DOCUMENT>
          <DOCUMENT_CLASSIFICATION>
            <DOCUMENT_CLASSES>
              <DOCUMENT_CLASS>
                <DocumentTypeOtherDescription>${esc(notes)}</DocumentTypeOtherDescription>
              </DOCUMENT_CLASS>
            </DOCUMENT_CLASSES>
          </DOCUMENT_CLASSIFICATION>
        </DOCUMENT>
      </DOCUMENTS>
    </DOCUMENT_SET>
  </DOCUMENT_SETS>
</MESSAGE>`;

  // Collapse the blank lines that optional elements leave behind, so the file a
  // person opens does not look half-empty.
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
    .split('\n')
    .filter((line) => line.trim())
    .join('\n');
}

/** A filename a loan officer can find again: surname, then the lead id. */
export function mismoFilename(lead) {
  const { last, first } = splitName(lead?.name);
  const stem = [last, first].filter(Boolean).join('-').replace(/[^A-Za-z0-9-]/g, '') || 'lead';
  return `${stem}-${lead?.id ?? 'export'}-mismo34.xml`;
}
