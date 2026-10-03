import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { decisionLabel } from './Badges';
import { CATS, MISSING_PENALTY, THRESHOLD, kwScore, pipelineSteps, type Request } from '../lib/model';

function stepWhy(r: Request, i: number): ReactNode {
  const n = r.kw.length;
  switch (i) {
    case 0:
      return n ? (
        <>
          {n >= 3 ? 'Strong' : n === 2 ? 'Moderate' : 'Weak'} match ({kwScore(n)}) on{' '}
          {r.kw.map((k) => <span key={k} className="chip chip--kw">{k}</span>)}
        </>
      ) : 'No keywords matched';
    case 1:
      return r.sig ? <>Urgency phrase <span className="chip chip--kw">{r.sig}</span> → {r.ai.pri}</> : 'No urgency signal → P3 default';
    case 2:
      return r.missing.length ? (
        <>Missing {r.missing.map((m) => <span key={m} className="chip chip--missing">{m}</span>)} · −{MISSING_PENALTY} pts each</>
      ) : 'All required fields present';
    case 3:
      return `Category mapping: ${CATS[r.ai.cat].type} → ${r.ai.queue}`;
    case 4:
      return `Default resolver for ${r.ai.queue}`;
    default:
      return `${r.conf}% ${r.conf >= THRESHOLD ? '≥' : '<'} ${THRESHOLD}% threshold${r.missing.length ? ' · incomplete' : ''}`;
  }
}

/** `liveStep` renders the in-progress variant used while a request is being ingested. */
export function Pipeline({ r, liveStep }: { r: Request; liveStep?: number }) {
  const steps = pipelineSteps(r);
  const live = liveStep !== undefined;
  return (
    <ol className="timeline">
      {steps.map((s, i) => {
        const state = live ? (i < liveStep! ? (s.ok ? 'ok' : 'warn') : i === liveStep ? 'run' : 'pending') : s.ok ? 'ok' : 'warn';
        const done = state === 'ok' || state === 'warn';
        return (
          <li key={s.title} className="tl-step">
            <span className={`tl-node tl-node--${state}`} aria-hidden="true">
              {state === 'ok' ? <Icon name="check" size="sm" /> : state === 'warn' ? <Icon name="alert" size="sm" /> : state === 'run' ? <Icon name="loader" size="sm" /> : i + 1}
            </span>
            <span className="tl-title"><span className="n">{i + 1}</span>{s.title}</span>
            <span className="tl-res">{done ? s.result : ''}</span>
            {done && <span className="tl-why">{stepWhy(r, i)}</span>}
          </li>
        );
      })}
      {!live && r.human && (
        <li className="tl-step">
          <span className="tl-node tl-node--human" aria-hidden="true"><Icon name={r.human.action === 'override' ? 'userEdit' : 'userCheck'} size="sm" /></span>
          <span className="tl-title"><span className="n">7</span>Human review</span>
          <span className="tl-res">{decisionLabel(r.human)}</span>
          <span className="tl-why">{r.human.by} · {r.human.at}</span>
        </li>
      )}
    </ol>
  );
}

export function ConfidenceBreakdown({ r }: { r: Request }) {
  const base = kwScore(r.kw.length);
  const pass = r.conf >= THRESHOLD;
  let run = base;
  return (
    <>
      <div className="wfall">
        <div className="wf-row">
          <span className="lbl">Keyword match ({r.kw.length})</span>
          <div className="wf-track"><div className="wf-seg wf-seg--plus" style={{ left: 0, width: `${base}%` }} /></div>
          <span className="val">+{base}</span>
        </div>
        {r.missing.map((m) => {
          run -= MISSING_PENALTY;
          return (
            <div key={m} className="wf-row">
              <span className="lbl">Missing <span className="mono">{m}</span></span>
              <div className="wf-track"><div className="wf-seg wf-seg--minus" style={{ left: `${run}%`, width: `${MISSING_PENALTY}%` }} /></div>
              <span className="val val--warn">−{MISSING_PENALTY}</span>
            </div>
          );
        })}
        <div className="wf-row wf-row--total">
          <span className="lbl">Confidence</span>
          <div className="wf-track"><div className={`wf-seg wf-seg--total-${pass ? 'pass' : 'fail'}`} style={{ left: 0, width: `${r.conf}%` }} /></div>
          <span className={`val ${pass ? 'val--pass' : 'val--warn'}`}>{r.conf}%</span>
        </div>
        <div className="wf-tline-wrap">
          <div className="wf-tline" style={{ left: `${THRESHOLD}%` }}><span>{THRESHOLD}% threshold</span></div>
        </div>
      </div>
      <p className="meter-foot breakdown-foot">
        <Icon name="info" size="xs" /> Keyword-match strength (1 kw 65 · 2 kw 80 · 3+ kw 95) − {MISSING_PENALTY} per missing required field.
      </p>
    </>
  );
}
