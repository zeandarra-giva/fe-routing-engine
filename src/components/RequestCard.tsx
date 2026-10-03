import { Icon } from './Icon';
import { ConfidencePanel, PriorityTag, StatusBadge, statusClass } from './Badges';
import { RationaleText } from './Rationale';
import { WorkLine } from './Work';
import { catLabel, type Request } from '../lib/model';

interface Props {
  req: Request;
  active: boolean;
  leaving: boolean;
  flash: boolean;
  onOpen: (id: string) => void;
}

/** Read-only summary; every action lives in the breakdown panel that opens on click. */
export function RequestCard({ req: r, active, leaving, flash, onOpen }: Props) {
  return (
    <article
      className={`card card--${statusClass(r.status)} work--${r.work} ${active ? 'is-active' : ''} ${leaving ? 'is-leaving' : ''} ${r.isNew || flash ? 'is-new' : ''}`}
      data-card={r.id}
      aria-labelledby={`t-${r.id}`}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, a')) onOpen(r.id);
      }}
    >
      <div className="card-body">
        <header className="card-head">
          <div className="card-heading">
            <div className="card-titleline">
              <span className="card-id">{r.id}</span>
              <button className="card-title" id={`t-${r.id}`} onClick={() => onOpen(r.id)}>{r.title}</button>
              {/* The tab already says Auto-routed / Needs review, so only a human decision earns a badge. */}
              {r.human && <StatusBadge status={r.status} human={r.human} />}
              {r.isNew && <span className="chip chip--new">Just ingested</span>}
            </div>
          </div>
          <div className="card-head-aside">
            <PriorityTag priority={r.cur.pri} />
            <span className="card-time" title="Received"><Icon name="clock" size="md" />{r.received}</span>
          </div>
        </header>

        <section className="card-assign" aria-label="Assignment details">
          <dl className="card-fields">
            <div className="card-field">
              <dt>Category</dt>
              <dd><Icon name="tag" size="md" />{catLabel(r.cur.cat)}</dd>
            </div>
            <div className="card-field">
              <dt>Queue</dt>
              <dd><Icon name="inbox" size="md" />{r.cur.queue}</dd>
            </div>
            <div className="card-field">
              <dt>Resolver</dt>
              <dd><Icon name="users" size="md" />{r.cur.group}</dd>
            </div>
          </dl>
        </section>

        <div className="card-insight">
          <div className="card-rationale">
            <span className="card-rationale-label"><Icon name="spark" size="md" />AI rationale</span>
            <p className="card-rationale-text"><RationaleText r={r} /></p>
          </div>
          <ConfidencePanel value={r.conf} />
        </div>
      </div>

      {/* Footer only while waiting on the requester. */}
      {r.work === 'waiting' && (
        <footer className="card-foot">
          <WorkLine r={r} />
        </footer>
      )}
    </article>
  );
}

export function SkeletonCard({ label }: { label?: string }) {
  return (
    <div className="card card--skeleton" aria-busy="true">
      <div className="card-body">
        <div className="card-head">
          <div className="card-heading">
            <div className="row">
              <div className="skel" style={{ height: 14, width: 64 }} />
              <div className="skel" style={{ height: 18, width: 220 }} />
              <div className="skel" style={{ height: 26, width: 104, borderRadius: 999 }} />
            </div>
          </div>
          <div className="card-head-aside">
            <div className="skel" style={{ height: 30, width: 88 }} />
          </div>
        </div>
        <div className="card-fields">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-field">
              <div className="skel" style={{ height: 10, width: 64 }} />
              <div className="skel" style={{ height: 14, width: 160 }} />
            </div>
          ))}
        </div>
        <div className="card-insight">
          <div className="skel" style={{ height: 64 }} />
          <div className="skel" style={{ height: 64 }} />
        </div>
      </div>
      <div className="card-foot">
        {label ? (
          <span className="provenance"><Icon name="loader" size="xs" /> {label}</span>
        ) : (
          <div className="skel" style={{ height: 14, width: 200 }} />
        )}
      </div>
    </div>
  );
}
