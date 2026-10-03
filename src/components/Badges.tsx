import { Icon, type IconName } from './Icon';
import { PRI_LABEL, THRESHOLD, type HumanAction, type Priority, type Status } from '../lib/model';

const STATUS: Record<Status, { cls: string; icon: IconName; label: string; code: string }> = {
  AR: { cls: 'ar', icon: 'checkCircle', label: 'Auto-routed', code: 'AUTO_ROUTED' },
  NR: { cls: 'nr', icon: 'alert', label: 'Needs review', code: 'NEEDS_REVIEW' },
  OV: { cls: 'ov', icon: 'userEdit', label: 'Overridden', code: 'OVERRIDDEN' },
  HA: { cls: 'ha', icon: 'userCheck', label: 'Automated route approved', code: 'HUMAN_APPROVED' },
};
/** How a human decision reads everywhere: approve = AI route accepted unchanged; override = analyst changed it. */
export const decisionLabel = (h: HumanAction) => (h.action === 'override' ? 'Overridden' : 'Automated route approved');
export const statusLabel = (s: Status) => STATUS[s].label;
export const statusClass = (s: Status) => STATUS[s].cls;

/** Pass `human` to name who made the call and when, e.g. "Approved by K. Lee · 16:11". */
export function StatusBadge({ status, human }: { status: Status; human?: HumanAction | null }) {
  const m = STATUS[status];
  return (
    <span className={`status status--${m.cls}`} title={m.code}>
      <Icon name={m.icon} size="sm" />
      {m.label}
      {human && <span className="status-by">{' '}by <b>{human.by}</b> · {human.at}</span>}
    </span>
  );
}

export function PriorityTag({ priority, short }: { priority: Priority; short?: boolean }) {
  const bars = 5 - Number(priority[1]);
  return (
    <span className={`prio prio--${priority.toLowerCase()}`} title={`Priority ${priority} – ${PRI_LABEL[priority]}`}>
      <span className="bars" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= bars ? 'on' : ''} />
        ))}
      </span>
      <b>{priority}</b>
      {!short && ` ${PRI_LABEL[priority]}`}
    </span>
  );
}

export function ConfidenceMeter({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  const pass = value >= THRESHOLD;
  const d = value - THRESHOLD;
  return (
    <div
      className={`meter meter--${pass ? 'pass' : 'fail'} meter--${size}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={`AI confidence ${value} percent; threshold ${THRESHOLD} percent; ${pass ? 'above' : 'below'} threshold`}
    >
      <div className="meter-head">
        <span className="meter-label">Confidence</span>
        <span className="meter-val">{value}%</span>
      </div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${value}%` }} />
        <div className="meter-thresh" style={{ left: `${THRESHOLD}%` }} data-t={THRESHOLD} />
      </div>
      <div className="meter-foot">
        {pass ? (
          <>
            <Icon name="check" size="xs" /> {d === 0 ? 'At' : `+${d} pts above`} threshold
          </>
        ) : (
          <>
            <Icon name="alert" size="xs" /> {-d} pts below {THRESHOLD}% threshold
          </>
        )}
      </div>
    </div>
  );
}

/** Card-level confidence block: tinted by pass/fail, with an explicit threshold marker. */
export function ConfidencePanel({ value }: { value: number }) {
  const pass = value >= THRESHOLD;
  const d = value - THRESHOLD;
  return (
    <div
      className={`conf conf--${pass ? 'pass' : 'fail'}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label={`AI confidence ${value} percent; threshold ${THRESHOLD} percent; ${pass ? 'above' : 'below'} threshold`}
    >
      <div className="conf-head">
        <span className="conf-label"><Icon name="gauge" size="md" />Confidence</span>
        <span className="conf-val">{value}%</span>
      </div>
      <div className="conf-track">
        <div className="conf-fill" style={{ width: `${value}%` }} />
        <div className="conf-thresh" style={{ left: `${THRESHOLD}%` }} />
      </div>
    </div>
  );
}
