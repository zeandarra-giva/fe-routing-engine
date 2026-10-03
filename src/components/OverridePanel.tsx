import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { CAT_KEYS, CATS, GROUPS, PRI_LABEL, PRIORITIES, QUEUES, catLabel, diffRoute, type CatKey, type Change, type Priority, type Request, type Route } from '../lib/model';

interface Props {
  req: Request;
  onSave: (route: Route, note: string, changes: Change[]) => void;
  onCancel: () => void;
}

export function OverridePanel({ req, onSave, onCancel }: Props) {
  const [route, setRoute] = useState<Route>({ ...req.cur });
  const [note, setNote] = useState('');
  const firstRef = useRef<HTMLSelectElement>(null);
  const changes = diffRoute(req.cur, route);
  const canSave = changes.length > 0 && note.trim().length >= 10;

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const setCat = (cat: CatKey) => setRoute((r) => ({ ...r, cat, queue: CATS[cat].queue, group: CATS[cat].group }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(route, note.trim(), changes);
  };

  return (
    <form
      className="ovr"
      onSubmit={submit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      aria-label={`Override AI decision for ${req.id}`}
      noValidate
    >
      <div className="ovr-head">
        <span className="ovr-title"><Icon name="userEdit" />Override AI decision</span>
        <span className="ovr-hint">Changes and reason are written to the audit log.</span>
      </div>
      <div className="ovr-grid">
        <label className="field">
          <span>Category <span className="ai-was">AI: {CATS[req.ai.cat].type}</span></span>
          <select ref={firstRef} value={route.cat} onChange={(e) => setCat(e.target.value as CatKey)}>
            {CAT_KEYS.map((k) => (
              <option key={k} value={k}>{catLabel(k)}</option>
            ))}
          </select>
        </label>
        <fieldset className="field">
          <legend>Priority <span className="ai-was">AI: {req.ai.pri}</span></legend>
          <div className="seg">
            {PRIORITIES.map((p) => (
              <label key={p}>
                <input type="radio" name={`pri-${req.id}`} value={p} checked={route.pri === p} onChange={() => setRoute((r) => ({ ...r, pri: p as Priority }))} />
                <span>{p} {PRI_LABEL[p]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Target queue <span className="ai-was">AI: {req.ai.queue}</span></span>
          <select value={route.queue} onChange={(e) => setRoute((r) => ({ ...r, queue: e.target.value }))}>
            {QUEUES.map((q) => <option key={q}>{q}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Resolver group <span className="ai-was">AI: {req.ai.group}</span></span>
          <select value={route.group} onChange={(e) => setRoute((r) => ({ ...r, group: e.target.value }))}>
            {GROUPS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field field--full">
          <span>Reason for override<em>Required</em></span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Requester confirmed this is a password reset on the HR portal, not a new account." />
          <small>At least 10 characters.</small>
        </label>
      </div>
      <div className="ovr-diff" aria-live="polite">
        {changes.length ? (
          <>
            <b>{changes.length} change{changes.length > 1 ? 's' : ''}:</b>{' '}
            {changes.map(([f, a, b], i) => (
              <span key={f}>
                {i > 0 && ' · '}
                {f} <s>{a}</s> → <b>{b}</b>
              </span>
            ))}
            {note.trim().length < 10 && <span className="warn-text"> · add a reason to save</span>}
          </>
        ) : (
          <>No changes yet. If the AI suggestion is correct, use <b>Approve</b> instead.</>
        )}
      </div>
      <div className="ovr-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel <span className="kbd">Esc</span></button>
        <button type="submit" className="btn btn-primary" disabled={!canSave}><Icon name="route" size="sm" />Save override &amp; route</button>
      </div>
    </form>
  );
}
