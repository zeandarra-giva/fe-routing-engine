import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { Pipeline } from './Pipeline';
import { SAMPLE_EMAILS, THRESHOLD, type Request } from '../lib/model';

interface Props {
  text: string;
  running: boolean;
  step: number;
  preview: Request | null;
  onText: (t: string) => void;
  onRun: () => void;
  onClose: () => void;
}

export function IngestModal({ text, running, step, preview, onText, onRun, onClose }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    taRef.current?.focus();
  }, []);

  return (
    <div className="modal-wrap" onClick={(e) => e.target === e.currentTarget && !running && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ing-h">
        <div className="modal-head">
          <span className="brand-mark brand-mark--soft"><Icon name="mail" /></span>
          <div className="grow">
            <h3 id="ing-h">Ingest from email</h3>
            <p>Run an email through the 6-step routing pipeline.</p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} disabled={running} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="sanitized"><Icon name="shield" size="sm" />Sample email: sanitized, no real data.</div>
          <div className="row">
            <span className="muted small">Load sample:</span>
            <button className="btn btn-secondary btn-sm" disabled={running} onClick={() => onText(SAMPLE_EMAILS.complete)}>Complete</button>
            <button className="btn btn-secondary btn-sm" disabled={running} onClick={() => onText(SAMPLE_EMAILS.incomplete)}>Incomplete</button>
          </div>
          <label className="field">
            <span>Email body</span>
            <textarea ref={taRef} className="email-ta" value={text} disabled={running} spellCheck={false} onChange={(e) => onText(e.target.value)} />
          </label>
          {running && preview && (
            <section className="dsec">
              <h4>Pipeline progress <span className="line" /></h4>
              <Pipeline r={preview} liveStep={step} />
            </section>
          )}
        </div>
        <div className="modal-foot">
          <span className="muted small grow">Threshold {THRESHOLD}%</span>
          <button className="btn btn-ghost" onClick={onClose} disabled={running}>Cancel</button>
          <button className="btn btn-primary" onClick={onRun} disabled={running || !text.trim()}>
            {running ? <><Icon name="loader" size="sm" />Running…</> : <><Icon name="spark" size="sm" />Run through pipeline</>}
          </button>
        </div>
      </div>
    </div>
  );
}
