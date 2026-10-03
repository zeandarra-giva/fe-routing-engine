import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { ANALYSTS, ME, TEAMMATES, clock, clockSec, type AnalystId, type Request, type WorkAction } from '../lib/model';

export function Avatar({ id, size = 'sm', online }: { id: AnalystId | null; size?: 'xs' | 'sm' | 'md'; online?: boolean }) {
  if (!id) return <span className={`avatar-chip avatar-chip--${size} avatar-chip--empty`} aria-hidden="true" />;
  const a = ANALYSTS[id];
  return (
    <span className={`avatar-chip avatar-chip--${size} hue-${a.hue}`} title={a.name + (id === ME ? ' (you)' : '')}>
      {a.initials}
      {online && <span className="presence" aria-hidden="true" />}
    </span>
  );
}

/** Closes a header popover on outside click or Escape (Escape is swallowed so it doesn't also close the panel). */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [open, close]);
  return ref;
}

const SHORTCUTS: [keys: string[], label: string][] = [
  [['J', 'K'], 'Move between tickets'],
  [['A'], 'Approve AI route'],
  [['O'], 'Override'],
  [[']'], 'Toggle details panel'],
  [['/'], 'Search'],
  [['Esc'], 'Close'],
  [['?'], 'Show shortcuts'],
];

/** Keyboard icon in the header; opens the shortcut reference. "?" toggles it from anywhere outside a text field. */
export function ShortcutsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, useCallback(() => setOpen(false), []));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== '?' || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="account" ref={ref}>
      <button
        className={`btn btn-ghost btn-icon shortcuts-btn ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="keyboard" />
      </button>
      {open && (
        <div className="account-card shortcuts-card" role="dialog" aria-label="Keyboard shortcuts">
          <div className="account-section">
            <span className="account-section-label">Keyboard shortcuts</span>
          </div>
          <ul className="shortcuts">
            {SHORTCUTS.map(([keys, label]) => (
              <li key={label}>
                <span className="shortcuts-keys">{keys.map((k) => <kbd key={k} className="kbd">{k}</kbd>)}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Account button in the header; opens a card with the signed-in analyst and who else is on shift. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, useCallback(() => setOpen(false), []));
  return (
    <div className="account" ref={ref}>
      <button
        className={`avatar account-btn ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Account and team"
        onClick={() => setOpen((o) => !o)}
      >
        {ANALYSTS[ME].initials}
      </button>
      {open && (
        <div className="account-card" role="dialog" aria-label="Account and team">
          <div className="account-me">
            <Avatar id={ME} size="md" online />
            <div className="account-me-text">
              <b>{ANALYSTS[ME].name}</b>
              <span>Operations Analyst</span>
            </div>
          </div>
          <div className="account-section">
            <span className="account-section-label">Team on shift</span>
            <span className="account-section-count">{TEAMMATES.length} online</span>
          </div>
          <ul className="account-team">
            {TEAMMATES.map((id) => (
              <li key={id} className="account-member">
                <Avatar id={id} online />
                <span className="account-member-name">{ANALYSTS[id].name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Footer status line; only a ticket waiting on its requester has one. */
export function WorkLine({ r }: { r: Request }) {
  if (r.work !== 'waiting') return null;
  const last = r.activity[r.activity.length - 1];
  return (
    <span className="workline workline--waiting">
      <Icon name="hourglass" size="xs" />
      <span className="workline-text">
        Awaiting requester
        {r.missing.length > 0 && <> for <b>{r.missing.join(', ')}</b></>}
        {' · since '}{clock(last.at)}
      </span>
    </span>
  );
}

export type Queue = 'ready' | 'review' | 'resolved';
/**
 * Which tab a ticket lives in. Once an analyst approves or overrides it, it moves to Resolved whichever queue it
 * came from; until then the AI's confidence decides Ready to route vs Needs review.
 */
export const queueOf = (r: Request): Queue => (r.human ? 'resolved' : r.ai.status === 'NR' ? 'review' : 'ready');

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

const since = (now: number, t: number) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

export function LastUpdated({ at, live, refreshing, lastEvent, onToggleLive, onRefresh }: {
  at: number;
  live: boolean;
  refreshing: boolean;
  lastEvent: string | null;
  onToggleLive: () => void;
  onRefresh: () => void;
}) {
  const now = useNow();
  return (
    <div className="last-updated" aria-live="off">
      <span className={`live-dot ${live ? 'is-live' : ''}`} aria-hidden="true" />
      <span className="lu-text">
        <b>{live ? 'Live' : 'Paused'}</b> · Queue updated <time dateTime={new Date(at).toISOString()} title={new Date(at).toLocaleString()}>{clockSec(at)}</time>
        <span className="lu-ago"> ({since(now, at)})</span>
        {lastEvent && <span className="lu-event"> — {lastEvent}</span>}
      </span>
      <button className="btn btn-ghost btn-icon btn-xs" onClick={onToggleLive} aria-label={live ? 'Pause live updates' : 'Resume live updates'} title={live ? 'Pause live updates' : 'Resume live updates'}>
        <Icon name={live ? 'pause' : 'play'} size="xs" />
      </button>
      <button className="btn btn-ghost btn-icon btn-xs" onClick={onRefresh} aria-label="Refresh queue" title="Refresh queue" disabled={refreshing}>
        <Icon name={refreshing ? 'loader' : 'refresh'} size="xs" />
      </button>
    </div>
  );
}

export const ACTION_META: Record<WorkAction, { label: string; icon: IconName; kind: 'primary' | 'secondary' | 'ghost' }> = {
  approve: { label: 'Approve / Route', icon: 'check', kind: 'primary' },
  override: { label: 'Override', icon: 'userEdit', kind: 'secondary' },
  requestInfo: { label: 'Request info', icon: 'hourglass', kind: 'secondary' },
  infoReceived: { label: 'Info received', icon: 'check', kind: 'secondary' },
};
