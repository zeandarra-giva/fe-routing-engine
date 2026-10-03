import type * as React from 'react';
import { Icon } from './Icon';
import { ConfidenceMeter, PriorityTag, StatusBadge, decisionLabel, statusClass } from './Badges';
import { Rationale } from './Rationale';
import { OverridePanel } from './OverridePanel';
import { ConfidenceBreakdown, Pipeline } from './Pipeline';
import { ACTION_META, Avatar, WorkLine } from './Work';
import { CATS, SYN, THRESHOLD, actionsFor, analystName, catLabel, clock, type Change, type Request, type Route, type WorkAction } from '../lib/model';

interface Props {
  req: Request | null;
  collapsed: boolean;
  overrideOpen: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onAction: (id: string, action: WorkAction) => void;
  onSaveOverride: (id: string, route: Route, note: string, changes: Change[]) => void;
}

function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="dsec">
      <h4>{title} {extra}<span className="line" /></h4>
      {children}
    </section>
  );
}

export function DetailPanel({ req: r, collapsed, overrideOpen, onCollapse, onExpand, onAction, onSaveOverride }: Props) {
  if (collapsed) {
    return (
      <aside className="detail-col is-collapsed" aria-label="Ticket breakdown (collapsed)">
        <div className="detail-rail">
          <button className="btn btn-ghost btn-icon" onClick={onExpand} aria-label="Expand ticket breakdown" aria-expanded="false" title="Expand breakdown">
            <Icon name="chevronLeft" />
          </button>
          {r && (
            <>
              <span className={`rail-dot rail-dot--${statusClass(r.status)}`} aria-hidden="true" />
              <span className="rail-label">{r.id}</span>
            </>
          )}
        </div>
      </aside>
    );
  }

  if (!r) {
    return (
      <aside className="detail-col" aria-label="Ticket breakdown">
        <div className="detail-head detail-head--bar">
          <span className="detail-head-title">Ticket breakdown</span>
          <span className="spacer" />
          <button className="btn btn-ghost btn-icon" onClick={onCollapse} aria-label="Collapse ticket breakdown" aria-expanded="true" title="Collapse"><Icon name="chevronRight" /></button>
        </div>
        <div className="detail-empty">
          <div className="empty-ico empty-ico--neutral"><Icon name="panel" size="lg" /></div>
          <h4>Select a ticket</h4>
          <p>Choose a request on the left to see the AI decision, pipeline and confidence breakdown.</p>
        </div>
      </aside>
    );
  }

  const pass = r.ai.status === 'AR';
  const c = CATS[r.ai.cat];

  return (
    <aside className="detail-col" aria-label={`Ticket breakdown for ${r.id}`}>
      <div className="detail-head">
        <div className="detail-head-top">
          <span className="detail-badges">
            <span className="card-id">{r.id}</span>
            {/* Every Ready-to-route ticket is auto-routed; the tab already says so. */}
            {r.status !== 'AR' && <StatusBadge status={r.status} />}
            <PriorityTag priority={r.cur.pri} />
          </span>
          <button className="btn btn-ghost btn-icon" onClick={onCollapse} aria-label="Collapse ticket breakdown" aria-expanded="true" title="Collapse"><Icon name="chevronRight" /></button>
        </div>
        <h3>{r.title}</h3>
        <div className="detail-request">
          <p className="desc-full">{r.desc}</p>
          <div className="meta-line">
            <span><Icon name="file" size="xs" /> Marketplace ticket (synthetic)</span>
            <span>Approved upstream · {r.received}</span>
            <span>{catLabel(r.cur.cat)}</span>
          </div>
        </div>
        <WorkLine r={r} />
      </div>

      <div className="detail-body">
        <div className={`decision decision--${pass ? 'pass' : 'fail'}`}>
          <div className="decision-top">
            <span className="eyebrow"><Icon name="spark" size="sm" />AI decision</span>
            <span className="provenance"><Icon name="clock" size="xs" />Received {r.received}</span>
          </div>
          <p className="decision-text">
            {pass ? (
              <>Auto-routed to <b>{r.ai.queue}</b> → <b>{r.ai.group}</b></>
            ) : (
              <>
                Held for human review:{' '}
                {r.missing.length > 0 && <><b>{r.missing.length} required field{r.missing.length > 1 ? 's' : ''} missing</b> and </>}
                confidence <b>below {THRESHOLD}%</b>.
              </>
            )}
          </p>
          <ConfidenceMeter value={r.conf} size="lg" />
          <Rationale r={r} />
        </div>

        {r.human && (
          <div className="human-box">
            <span className="who">
              <Icon name={r.human.action === 'override' ? 'userEdit' : 'userCheck'} size="sm" />
              {decisionLabel(r.human)} by {r.human.by} · {r.human.at}
            </span>
            {r.human.changes.length ? (
              <div>
                {r.human.changes.map(([f, a, b], i) => (
                  <span key={f}>{i > 0 && ' · '}{f}: <s>{a}</s> → <b>{b}</b></span>
                ))}
              </div>
            ) : (
              <div>Accepted the AI route as recommended — no changes.</div>
            )}
            {r.human.note && <q>{r.human.note}</q>}
          </div>
        )}

        {overrideOpen && (
          <OverridePanel key={r.id} req={r} onCancel={() => onAction(r.id, 'override')} onSave={(route, note, changes) => onSaveOverride(r.id, route, note, changes)} />
        )}

        <Section title="Activity" extra={<span className="count-pill">{r.activity.length}</span>}>
          <ol className="activity">
            {[...r.activity].reverse().map((a, i) => (
              <li key={i}>
                {a.who === 'ai' ? <span className="avatar-chip avatar-chip--xs avatar-chip--ai"><Icon name="spark" size="xs" /></span> : <Avatar id={a.who} size="xs" />}
                <span className="activity-text"><b>{a.who === 'ai' ? 'AI' : analystName(a.who)}</b> {a.text}</span>
                <time>{clock(a.at)}</time>
              </li>
            ))}
          </ol>
        </Section>


        <Section title="Extracted fields">
          <table className="ftable">
            <thead><tr><th>Field</th><th>Value</th><th>Status</th></tr></thead>
            <tbody>
              {c.req.map((f) => {
                const miss = r.missing.includes(f);
                return (
                  <tr key={f} className={miss ? 'miss' : ''}>
                    <td>{f}</td>
                    <td>{miss ? <span className="muted">—</span> : SYN[f]}</td>
                    <td>
                      {miss ? (
                        <span className="fstate fstate--miss"><Icon name="alert" size="xs" />Missing</span>
                      ) : (
                        <span className="fstate fstate--ok"><Icon name="check" size="xs" />Present</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section title="Pipeline"><Pipeline r={r} /></Section>
        <Section title="Confidence breakdown"><ConfidenceBreakdown r={r} /></Section>
      </div>

      <div className="detail-foot">
        {[...actionsFor(r)].reverse().map((a) => {
          const m = ACTION_META[a];
          return (
            <button key={a} className={`btn btn-${m.kind}`} onClick={() => onAction(r.id, a)} aria-expanded={a === 'override' ? overrideOpen : undefined}>
              <Icon name={m.icon} size="sm" />{m.label}
              {a === 'approve' && <span className="kbd">A</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
