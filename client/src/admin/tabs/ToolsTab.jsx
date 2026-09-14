import { useState } from 'react';

import { TOOLS } from '@shared/domain.js';
import { adminApi } from '../../lib/api.js';
import { useAdmin } from '../AdminContext.jsx';
import { ErrorNote, Toggle } from '../ui.jsx';

/** One switch per buyer tool. Turning one off hides it everywhere in the buyer app. */
export default function ToolsTab({ community, reload }) {
  const { token } = useAdmin();
  const [error, setError] = useState('');

  const toggle = async (key, on) => {
    setError('');
    try {
      await adminApi.updateCommunity(token, community.id, { tools: { [key]: on } });
      await reload();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="text-muted" style={{ fontSize: 13, margin: '0 0 4px' }}>
        Choose which questions this community&apos;s buyers can answer for themselves.
      </p>
      {TOOLS.map((tool) => (
        <div key={tool.k} className="card elev-sm" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="card-title" style={{ fontSize: 15 }}>{tool.name}</div>
            <div className="text-muted" style={{ fontSize: 12.5 }}>{tool.q}</div>
          </div>
          <Toggle
            on={Boolean(community.tools[tool.k])}
            onChange={(on) => toggle(tool.k, on)}
            label={`${tool.name} enabled`}
          />
        </div>
      ))}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
