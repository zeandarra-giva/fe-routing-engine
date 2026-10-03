import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { THRESHOLD, type Request } from '../lib/model';

const MINUTES_PER_AUTO_ROUTE = 7;
const HIDDEN_KEY = 'iwre.kpisHidden';

function readHidden() {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Navy band holding the KPI cards; collapses to a one-line summary and remembers the choice per browser. */
function KpiBand({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [hidden, setHidden] = useState(readHidden);
  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0');
    } catch {
      /* storage unavailable — choice just won't persist */
    }
  }, [hidden]);
  return (
    <section className={`kpi-band ${hidden ? 'is-hidden' : ''}`} aria-label="Today's overview">
      <div className="kpi-band-head">
        <span className="kpi-band-title">Today's overview</span>
        {hidden && <span className="kpi-band-summary">{summary}</span>}
        <button className="kpi-band-toggle" aria-expanded={!hidden} aria-controls="kpi-grid" onClick={() => setHidden((h) => !h)}>
          {hidden ? 'Show stats' : 'Hide stats'}
          <Icon name={hidden ? 'chevronDown' : 'chevronUp'} size="sm" />
        </button>
      </div>
      {!hidden && children}
    </section>
  );
}

export function KpiStrip({ reqs, cleared, loading }: { reqs: Request[]; cleared: number; loading: boolean }) {
  if (loading) {
    return (
      <KpiBand summary="Loading…">
        <div className="kpis" id="kpi-grid">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="kpi">
              <div className="skel" style={{ height: 12, width: '50%' }} />
              <div className="skel" style={{ height: 28, width: '70%', marginTop: 6 }} />
              <div className="skel" style={{ height: 10, width: '80%', marginTop: 4 }} />
            </div>
          ))}
        </div>
      </KpiBand>
    );
  }
  const total = reqs.length;
  const auto = reqs.filter((r) => r.ai.status === 'AR').length;
  const review = reqs.filter((r) => r.status === 'NR').length;
  const pct = ((auto / total) * 100).toFixed(1);

  const summary = (
    <>
      <b>{total}</b> total · <b>{auto}</b> auto-routed · <b className="kpi-band-warn">{review}</b> needs review · <b>96.7%</b> accuracy · <b>{auto * MINUTES_PER_AUTO_ROUTE}</b> min saved
    </>
  );

  return (
    <KpiBand summary={summary}>
      <div className="kpis" id="kpi-grid" role="list">
        <div className="kpi" role="listitem">
          <span className="kpi-label"><Icon name="layers" size="sm" />Total requests</span>
          <span className="kpi-value">{total}</span>
          <span className="kpi-sub">Approved Marketplace tickets · today</span>
        </div>
        <div className="kpi" role="listitem">
          <span className="kpi-label"><Icon name="checkCircle" size="sm" />Auto-routed</span>
          <span className="kpi-value">{auto}<small>{pct}%</small></span>
          <div className="kpi-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
          <span className="kpi-sub">Confidence ≥ {THRESHOLD}% and complete</span>
        </div>
        <div className="kpi kpi--warn" role="listitem">
          <span className="kpi-label"><Icon name="alert" size="sm" />Needs review</span>
          <span className="kpi-value">{review}</span>
          <span className="kpi-sub">
            {cleared ? <><span className="kpi-delta">−{cleared} cleared</span> this session</> : 'In exception queue'}
          </span>
        </div>
        <div className="kpi" role="listitem">
          <span className="kpi-label"><Icon name="target" size="sm" />Accuracy</span>
          <span className="kpi-value">96.7%</span>
          <span className="kpi-sub">vs human-labeled set (58/60)</span>
        </div>
        <div className="kpi" role="listitem">
          <span className="kpi-label"><Icon name="clock" size="sm" />Minutes saved</span>
          <span className="kpi-value">{auto * MINUTES_PER_AUTO_ROUTE}</span>
          <span className="kpi-sub">≈ {MINUTES_PER_AUTO_ROUTE} min manual triage × {auto}</span>
        </div>
      </div>
    </KpiBand>
  );
}
