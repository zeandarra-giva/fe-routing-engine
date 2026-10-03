import type * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { KpiStrip } from './components/KpiStrip';
import { RequestCard, SkeletonCard } from './components/RequestCard';
import { DetailPanel } from './components/DetailPanel';
import { IngestModal } from './components/IngestModal';
import { Splitter } from './components/Splitter';
import { statusLabel } from './components/Badges';
import { AccountMenu, LastUpdated, ShortcutsMenu, queueOf, type Queue } from './components/Work';
import {
  ANALYSTS, ME, SAMPLE_EMAILS, TEAMMATES, THRESHOLD, actionsFor, analyze, buildData, catLabel, approveRoute, clock, withWork,
  type Change, type Request, type Route, type WorkAction,
} from './lib/model';

type Tab = Queue;
interface Toast {
  msg: React.ReactNode;
  undo: boolean;
}
interface Snapshot {
  reqs: Request[];
  cleared: number;
}
interface Ingest {
  text: string;
  running: boolean;
  step: number;
  preview: Request | null;
}

const ME_LABEL = 'A. Analyst (you)';
const SIM_INTERVAL = 9000;
const SPLITTER = 16;
/** Panel's share of the workspace; the list and the panel start out equal. */
const PANEL_RATIO_DEFAULT = 0.5;
const PANEL_MIN = 360;
const LIST_MIN = 440;
const PANEL_KEY = 'iwre.panelRatio';

function readPanelRatio() {
  try {
    const v = Number(localStorage.getItem(PANEL_KEY));
    return v > 0 && v < 1 ? v : PANEL_RATIO_DEFAULT;
  } catch {
    return PANEL_RATIO_DEFAULT;
  }
}
const clone = (reqs: Request[]) => reqs.map((r) => ({ ...r, cur: { ...r.cur } }));

export default function App() {
  const [reqs, setReqs] = useState<Request[]>(buildData);
  const [tab, setTab] = useState<Tab>('ready');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [panelRatio, setPanelRatio] = useState(readPanelRatio);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [leavingId, setLeavingId] = useState<string | null>(null);
  const [cleared, setCleared] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [ingest, setIngest] = useState<Ingest | null>(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const reqsRef = useRef(reqs);
  reqsRef.current = reqs;
  const overrideRef = useRef(overrideId);
  overrideRef.current = overrideId;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const undoRef = useRef<Snapshot | null>(null);
  const nextIdRef = useRef(2060);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(undefined);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 700);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = workspaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWorkspaceWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, String(panelRatio));
    } catch {
      /* storage unavailable — split just won't persist */
    }
  }, [panelRatio]);

  // The split is stored as a ratio so it keeps its proportions when the window resizes.
  const splitSpace = Math.max(0, workspaceWidth - SPLITTER);
  const panelMax = Math.max(PANEL_MIN, splitSpace - LIST_MIN);
  const effectivePanelWidth = Math.round(Math.min(panelMax, Math.max(PANEL_MIN, panelRatio * splitSpace)));
  const setPanelWidth = (w: number) => splitSpace && setPanelRatio(w / splitSpace);

  const showToast = useCallback((msg: React.ReactNode, undo: boolean, ms = 6000) => {
    window.clearTimeout(toastTimer.current);
    setToast({ msg, undo });
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      undoRef.current = null;
    }, ms);
  }, []);

  // Any data change — yours or a teammate's — bumps the queue's "last updated" stamp.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setLastUpdated(Date.now());
  }, [reqs]);

  const flash = (id: string) => {
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 2200);
  };

  // Simulated teammates working the same queue.
  useEffect(() => {
    if (!live || loading) return;
    const t = window.setInterval(() => {
      const all = reqsRef.current;
      const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
      const who = pick(TEAMMATES);
      const name = ANALYSTS[who].name;
      // Leave alone whatever you're looking at or editing.
      const busy = (r: Request) => r.id === overrideRef.current || r.id === selectedRef.current;
      // Mostly confident routes get approved; now and then someone clears a review ticket.
      const routed = all.filter((r) => !r.human && r.status === 'AR' && !busy(r));
      const review = all.filter((r) => !r.human && r.status === 'NR' && r.work === 'open' && !busy(r));
      const pool = Math.random() < 0.6 && routed.length ? routed : review;
      if (!pool.length) return;
      const target = pick(pool).id;
      setReqs((prev) => prev.map((x) => (x.id === target ? approveRoute(x, who, name) : x)));
      setLastEvent(`${name} approved ${target}`);
      flash(target);
    }, SIM_INTERVAL);
    return () => window.clearInterval(t);
  }, [live, loading]);

  const refresh = () => {
    setRefreshing(true);
    window.setTimeout(() => {
      setLastUpdated(Date.now());
      setRefreshing(false);
    }, 500);
  };

  const byQueue = useMemo(() => {
    const q: Record<Queue, Request[]> = { ready: [], review: [], resolved: [] };
    for (const r of reqs) q[queueOf(r)].push(r);
    return q;
  }, [reqs]);
  const list = useMemo(() => {
    let L = byQueue[tab].slice();
    if (tab === 'review') L.sort((a, b) => a.cur.pri.localeCompare(b.cur.pri) || a.conf - b.conf);
    else if (tab === 'resolved') L.sort((a, b) => b.updatedAt - a.updatedAt);
    L.sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew));
    const q = query.trim().toLowerCase();
    if (q) L = L.filter((r) => [r.id, r.title, r.desc, r.cur.queue, r.cur.group, catLabel(r.cur.cat)].join(' ').toLowerCase().includes(q));
    return L;
  }, [byQueue, tab, query]);
  // Approving or overriding moves a ticket to Resolved, so outside that tab it animates out of the list.
  const leavesList = tab !== 'resolved';

  // The breakdown panel always shows a ticket from the current tab: when the open ticket isn't in this list
  // (first load, tab switch, search, a teammate's change), fall back to the list's first ticket.
  const inList = !!selectedId && list.some((r) => r.id === selectedId);
  useEffect(() => {
    if (!loading && !inList) setSelectedId(list[0]?.id ?? null);
  }, [loading, inList, list]);

  const selectedReq = selectedId ? reqs.find((r) => r.id === selectedId) ?? null : null;
  const panelShows = (id: string) => !collapsed && selectedId === id;

  const focusCard = (id?: string) => {
    if (!id) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`t-${id}`);
      el?.focus();
      el?.closest('.card')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const select = (id: string) => {
    if (id !== selectedId) setOverrideId((cur) => (cur === id ? cur : null));
    setSelectedId(id);
    setCollapsed(false);
  };

  const snapshot = () => {
    undoRef.current = { reqs: clone(reqs), cleared };
  };

  const approve = (id: string) => {
    const r = reqs.find((x) => x.id === id);
    if (!r || r.human) return;
    const idx = list.findIndex((x) => x.id === id);
    const nextId = (list[idx + 1] ?? list[idx - 1])?.id;
    snapshot();
    const commit = () => {
      setReqs((prev) => prev.map((x) => {
        if (x.id !== id) return x;
        return approveRoute(x, ME, ME_LABEL);
      }));
      setLastEvent(`You approved ${id}`);
      if (r.status === 'NR') setCleared((c) => c + 1);
      setOverrideId(null);
      setLeavingId(null);
      showToast(<><b>{id}</b> route approved → {r.cur.queue}</>, true);
      if (leavesList && nextId) {
        if (selectedId === id) setSelectedId(nextId);
        focusCard(nextId);
      }
    };
    if (leavesList) {
      setLeavingId(id);
      window.setTimeout(commit, 220);
    } else commit();
  };

  const saveOverride = (id: string, route: Route, note: string, changes: Change[]) => {
    const r = reqs.find((x) => x.id === id);
    if (!r) return;
    snapshot();
    setReqs((prev) => prev.map((x) => {
      if (x.id !== id) return x;
      return { ...withWork(x, 'open', ME, `Overrode AI: ${changes.map(([f, , b]) => `${f} → ${b}`).join(', ')}`), cur: route, status: 'OV', human: { action: 'override', by: ME_LABEL, at: clock(Date.now()), note, changes } };
    }));
    setLastEvent(`You overrode ${id}`);
    if (r.status === 'NR') setCleared((c) => c + 1);
    setOverrideId(null);
    showToast(<><b>{id}</b> overridden → {route.queue}</>, true);
    if (leavesList) {
      const idx = list.findIndex((x) => x.id === id);
      const nextId = (list[idx + 1] ?? list[idx - 1])?.id;
      if (nextId) {
        if (selectedId === id) setSelectedId(nextId);
        focusCard(nextId);
      }
    }
  };

  const undo = () => {
    const s = undoRef.current;
    if (s) {
      setReqs(s.reqs);
      setCleared(s.cleared);
      undoRef.current = null;
    }
    showToast('Action undone', false, 2500);
  };

  const toggleOverride = (id: string) => setOverrideId((cur) => (cur === id ? null : id));

  const WORK_VERBS: Partial<Record<WorkAction, { verb: string; run: (r: Request) => Request }>> = {
    requestInfo: { verb: 'requested info on', run: (r) => withWork(r, 'waiting', ME, `Requested ${r.missing.join(', ')} from requester`) },
    infoReceived: { verb: 'resumed', run: (r) => withWork(r, 'open', ME, 'Requester info received') },
  };

  const handleAction = (id: string, action: WorkAction) => {
    const r = reqs.find((x) => x.id === id);
    if (!r) return;
    if (!actionsFor(r).includes(action)) return;
    if (action === 'approve') return approve(id);
    if (action === 'override') return toggleOverride(id);
    const op = WORK_VERBS[action];
    if (!op) return;
    snapshot();
    setReqs((prev) => prev.map((x) => (x.id === id ? op.run(x) : x)));
    setLastEvent(`You ${op.verb} ${id}`);
    showToast(<>You {op.verb} <b>{id}</b></>, true);
  };

  const runIngest = () => {
    if (!ingest) return;
    const id = `REQ-${nextIdRef.current++}`;
    const r = analyze(ingest.text, id);
    setIngest({ ...ingest, running: true, step: 0, preview: r });
    let step = 0;
    const tick = () => {
      step++;
      if (step <= 6) {
        setIngest((g) => (g ? { ...g, step } : g));
        window.setTimeout(tick, 320);
        return;
      }
      setReqs((prev) => [{ ...r, isNew: true }, ...prev]);
      setIngest(null);
      setTab(queueOf(r));
      setQuery('');
      select(id);
      showToast(<><b>{id}</b> ingested → {statusLabel(r.status)}{r.status === 'AR' ? ` to ${r.cur.queue}` : ''}</>, false);
      window.setTimeout(() => setReqs((prev) => prev.map((x) => (x.id === id ? { ...x, isNew: false } : x))), 2400);
    };
    window.setTimeout(tick, 320);
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Escape') {
        if (ingest && !ingest.running) return setIngest(null);
        if (overrideId) {
          const p = overrideId;
          setOverrideId(null);
          focusCard(p);
          return;
        }
        if (!collapsed) return setCollapsed(true);
      }
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey || ingest) return;
      const curId = t.closest<HTMLElement>('[data-card]')?.dataset.card ?? selectedId ?? undefined;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        let i = list.findIndex((r) => r.id === curId);
        i = e.key === 'j' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
        const next = list[i]?.id;
        if (next) {
          select(next);
          focusCard(next);
        }
      } else if ((e.key === 'a' || e.key === 'o') && curId) {
        // Actions happen in the breakdown panel: the first press opens it, the next one acts.
        e.preventDefault();
        if (!panelShows(curId)) return select(curId);
        if (e.key === 'a') handleAction(curId, 'approve');
        else if (actionsFor(reqs.find((x) => x.id === curId)!).includes('override')) setOverrideId(curId);
      } else if (e.key === ']') {
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const order: Tab[] = ['ready', 'review', 'resolved'];
    const next = order[(order.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <div className="app">
      <header className="app-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            {/* A route that ends at a red destination pin: requests finding their way to the right team. */}
            <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="19" r="2.5" stroke="var(--navy-800)" strokeWidth="2" />
              <path d="M8.5 19h8a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H14" stroke="var(--navy-800)" strokeWidth="2" />
              <circle cx="18" cy="5" r="3" fill="var(--red-500)" />
            </svg>
          </span>
          <div className="brand-name">Waze <span>to</span> Work</div>
        </div>
        <div className="app-top-right">
          <LastUpdated at={lastUpdated} live={live} refreshing={refreshing} lastEvent={lastEvent} onToggleLive={() => setLive((v) => !v)} onRefresh={refresh} />
          <ShortcutsMenu />
          <button className="btn btn-secondary btn-sm" onClick={() => setIngest({ text: SAMPLE_EMAILS.complete, running: false, step: 0, preview: null })}>
            <Icon name="mail" size="sm" />Ingest email
          </button>
          <AccountMenu />
        </div>
      </header>

      <main className="app-body">
        <KpiStrip reqs={reqs} cleared={cleared} loading={loading} />

        <div
          ref={workspaceRef}
          className={`workspace ${collapsed ? 'is-collapsed' : ''}`}
          style={collapsed ? undefined : { gridTemplateColumns: `minmax(0, 1fr) ${SPLITTER}px ${effectivePanelWidth}px` }}
        >
          <section className="list-col" aria-label="Tickets">
            <div className="toolbar">
              <div className="tabs" role="tablist" aria-label="Request views" onKeyDown={onTabKey}>
                <button className="tab" role="tab" id="tab-ready" aria-selected={tab === 'ready'} tabIndex={tab === 'ready' ? 0 : -1} onClick={() => { setTab('ready'); setOverrideId(null); }} title={`AI confidence ≥ ${THRESHOLD}% and all required fields present`}>
                  <Icon name="route" size="sm" />Ready to route <span className="tab-count">{byQueue.ready.length}</span>
                </button>
                <button className="tab" role="tab" id="tab-review" aria-selected={tab === 'review'} tabIndex={tab === 'review' ? 0 : -1} onClick={() => { setTab('review'); setOverrideId(null); }} title={`AI confidence below ${THRESHOLD}% or required fields missing`}>
                  <Icon name="alert" size="sm" />Needs review <span className="tab-count tab-count--warn">{byQueue.review.length}</span>
                </button>
                <button className="tab" role="tab" id="tab-resolved" aria-selected={tab === 'resolved'} tabIndex={tab === 'resolved' ? 0 : -1} onClick={() => { setTab('resolved'); setOverrideId(null); }} title="Decided by an analyst: AI route approved as-is, or overridden">
                  <Icon name="userCheck" size="sm" />Resolved <span className="tab-count">{byQueue.resolved.length}</span>
                </button>
              </div>
              <label className="search">
                <Icon name="search" size="sm" />
                <span className="sr-only">Search requests</span>
                <input ref={searchRef} type="search" placeholder="Search tickets…" title="Search by ID, title, queue or resolver" value={query} onChange={(e) => setQuery(e.target.value)} />
                <span className="kbd">/</span>
              </label>
            </div>

            <div className="list-scroll">
            <div className="cards">
              {loading ? (
                <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
              ) : (
                <>
                  {ingest?.running && <SkeletonCard label={`Running pipeline… step ${ingest.step}/6`} />}
                  {list.length ? (
                    list.map((r) => (
                      <RequestCard
                        key={r.id}
                        req={r}
                        active={selectedId === r.id}
                        leaving={leavingId === r.id}
                        flash={flashId === r.id}
                        onOpen={select}
                      />
                    ))
                  ) : query ? (
                    <div className="empty">
                      <div className="empty-ico empty-ico--neutral"><Icon name="search" size="lg" /></div>
                      <h4>No requests match “{query}”</h4>
                      <p>Try a ticket ID, queue or resolver group.</p>
                      <button className="btn btn-secondary" onClick={() => setQuery('')}>Clear search</button>
                    </div>
                  ) : tab === 'ready' ? (
                    <div className="empty">
                      <div className="empty-ico"><Icon name="checkCircle" size="lg" /></div>
                      <h4>Nothing waiting to route</h4>
                      <p>Every confident AI recommendation has been handled. New requests appear here as they arrive.</p>
                    </div>
                  ) : tab === 'review' ? (
                    <div className="empty">
                      <div className="empty-ico"><Icon name="checkCircle" size="lg" /></div>
                      <h4>Review queue is clear</h4>
                      <p>Every low-confidence or incomplete request has an analyst decision.</p>
                      <button className="btn btn-secondary" onClick={() => setTab('resolved')}>View resolved</button>
                    </div>
                  ) : (
                    <div className="empty">
                      <div className="empty-ico empty-ico--neutral"><Icon name="userCheck" size="lg" /></div>
                      <h4>No resolved tickets yet</h4>
                      <p>Tickets show up here once an analyst approves the AI route or overrides it.</p>
                    </div>
                  )}
                </>
              )}
            </div>

            </div>
          </section>

          {!collapsed && (
            <Splitter value={effectivePanelWidth} min={PANEL_MIN} max={panelMax} onChange={setPanelWidth} onReset={() => setPanelRatio(PANEL_RATIO_DEFAULT)} />
          )}

          <DetailPanel
            req={selectedReq}
            collapsed={collapsed}
            overrideOpen={!!selectedReq && overrideId === selectedReq.id}
            onCollapse={() => setCollapsed(true)}
            onExpand={() => setCollapsed(false)}
            onAction={handleAction}
            onSaveOverride={saveOverride}
          />
        </div>
      </main>

      {ingest && (
        <IngestModal
          text={ingest.text}
          running={ingest.running}
          step={ingest.step}
          preview={ingest.preview}
          onText={(text) => setIngest((g) => (g ? { ...g, text } : g))}
          onRun={runIngest}
          onClose={() => !ingest.running && setIngest(null)}
        />
      )}

      <div className="toast-region" aria-live="polite">
        {toast && (
          <div className="toast" role="status">
            <Icon name="checkCircle" size="sm" />
            <span>{toast.msg}</span>
            {toast.undo && <button onClick={undo}><Icon name="undo" size="xs" />Undo</button>}
            <button onClick={() => setToast(null)} aria-label="Dismiss"><Icon name="x" size="xs" /></button>
          </div>
        )}
      </div>
    </div>
  );
}
