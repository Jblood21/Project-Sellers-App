import { useEffect, useState } from 'react';

import { DEFAULT_FAQ, FAQ_ANSWER_MAX, FAQ_MAX_ITEMS, FAQ_QUESTION_MAX, parseFaq } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { Disclosure, ErrorNote, TextAreaField, TextField, Toggle } from '../ui.jsx';

const grouped = (n) => n.toLocaleString('en-US');

/**
 * The FAQ shown on the buyer's home screen, a question and its answer at a time.
 *
 * Items are edited in place and go live together with the page's Save settings
 * button, like the rest of the copy. A question with no answer (or the reverse)
 * is left out when saved, so a half-finished row never reaches a buyer. The
 * switch saves at once.
 */
export default function FaqCard({ community, settings, setSettings, reload }) {
  const { token } = useAdmin();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const on = community.features?.faq !== false;

  // The form holds raw rows (so an empty one can be typed into); the stored
  // value is the cleaned list.
  const [rows, setRows] = useState(() => parseFaq(settings.faqJson));
  // The same test the page's Save bar uses, so the badge and the leave-prompt agree.
  const unsaved = (settings.faqJson ?? '[]') !== (community.settings.faqJson ?? '[]');

  // After a save the server has dropped half-finished rows; the form follows it.
  const savedFaq = community.settings.faqJson;
  useEffect(() => {
    setRows(parseFaq(savedFaq));
  }, [savedFaq]);

  const commit = (next) => {
    setRows(next);
    // serializeFaq drops half-finished rows from what is stored, never from the form.
    setSettings((prev) => ({ ...prev, faqJson: JSON.stringify(next) }));
  };
  const edit = (index, key) => (value) => commit(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const remove = (index) => {
    if (!window.confirm('Remove this question?')) return;
    commit(rows.filter((_, i) => i !== index));
  };
  // Replaces the list with the starter questions. Like every edit here it only goes
  // live with Save settings, and it asks first when there is something to lose.
  const restore = () => {
    if (rows.length && !window.confirm('Replace the questions below with the starter questions? Nothing changes for buyers until you press Save settings.')) return;
    commit(DEFAULT_FAQ.map((item) => ({ ...item })));
  };
  const move = (index, by) => {
    const target = index + by;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const flip = async (next) => {
    setBusy(true);
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { features: { faq: next } });
      await reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // What a buyer would get from the form as it is now, so the folded heading tells the truth.
  const complete = parseFaq(settings.faqJson).length;
  const summary = `${complete ? `${complete} question${complete === 1 ? '' : 's'}` : 'No questions yet'} · ${on ? 'Shown on the home screen' : 'Hidden'}`;

  return (
    <Disclosure
      title="FAQ"
      summary={summary}
      tag={unsaved ? <span className="tag tag-accent">Unsaved changes</span> : null}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Toggle on={on} onChange={flip} label="Show the FAQ to buyers" />
        <span style={{ fontSize: 13 }}>
          <strong>{on ? 'Shown on the home screen' : 'Hidden'}</strong>
          <span className="text-muted">{busy ? ' · saving…' : ' · the section only appears once it has a question and an answer'}</span>
        </span>
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
        A new community starts with a set of starter questions; change them, reorder them or remove any you do not
        want. Up to {FAQ_MAX_ITEMS} questions. Answers are plain text; a line break stays a line break. The switch
        saves at once; the questions go live when you press <strong>Save settings</strong>.
      </p>

      {rows.map((row, index) => (
        <div key={index} className="ax-group" role="group" aria-label={`FAQ item ${index + 1}`}>
          <TextField
            id={`faq-q-${index}`} label={`Question ${index + 1}`} value={row.q} maxLength={FAQ_QUESTION_MAX}
            onChange={edit(index, 'q')} hint={`Up to ${grouped(FAQ_QUESTION_MAX)} characters.`}
          />
          <TextAreaField
            id={`faq-a-${index}`} label="Answer" rows={3} value={row.a} maxLength={FAQ_ANSWER_MAX}
            onChange={edit(index, 'a')} counter={`${grouped(row.a.length)} of ${grouped(FAQ_ANSWER_MAX)} characters`}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={index === 0} onClick={() => move(index, -1)}>
              Move up
            </button>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
              Move down
            </button>
            <button type="button" className="btn btn-ghost" style={{ minHeight: 44, marginLeft: 'auto' }} onClick={() => remove(index)}>
              Remove
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button" className="btn btn-secondary" style={{ minHeight: 44 }}
          disabled={rows.length >= FAQ_MAX_ITEMS}
          onClick={() => commit([...rows, { q: '', a: '' }])}
        >
          {rows.length >= FAQ_MAX_ITEMS ? `That is the most (${FAQ_MAX_ITEMS})` : 'Add a question'}
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={restore}>
          Restore the starter questions
        </button>
      </div>
    </Disclosure>
  );
}
