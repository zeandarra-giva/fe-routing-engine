import { Icon } from './Icon';
import { CATS, THRESHOLD, type Request } from '../lib/model';

export function RationaleText({ r }: { r: Request }) {
  const c = CATS[r.ai.cat];
  const n = r.kw.length;
  return (
    <>
      {n >= 3 ? (
        <>Strong match to <b>{c.type}</b> on {n} keywords.</>
      ) : n === 2 ? (
        <>Moderate match to <b>{c.type}</b> on 2 keywords.</>
      ) : n === 1 ? (
        <>Weak match: only “{r.kw[0]}” matched, so <b>{c.type}</b> is uncertain.</>
      ) : (
        <>No category keywords matched.</>
      )}
      {r.sig ? ` “${r.sig}” set priority to ${r.ai.pri}.` : ` No urgency signal, so default ${r.ai.pri}.`}
      {r.missing.length ? ` Required field${r.missing.length > 1 ? 's' : ''} missing.` : ' All required fields present.'}
      {r.ai.status === 'AR'
        ? ` ${r.conf}% ≥ ${THRESHOLD}% → auto-routed to ${c.queue}.`
        : ` ${r.conf}% < ${THRESHOLD}% → held for human review.`}
    </>
  );
}

export function Rationale({ r }: { r: Request }) {
  return (
    <div className="rationale">
      <Icon name="spark" size="sm" />
      <div className="rationale-body">
        <span className="rationale-label">AI rationale</span>
        <RationaleText r={r} />
        <div className="rationale-chips">
          {r.kw.map((k) => (
            <span key={k} className="chip chip--kw">{k}</span>
          ))}
          {r.missing.map((m) => (
            <span key={m} className="chip chip--missing">missing: {m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
