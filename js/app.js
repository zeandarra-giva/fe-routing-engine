// App controller: one state object, region renderers, delegated events, timers.
// Each region re-renders only when the data it shows changes, so focus, scroll position and
// half-typed form input survive background updates (live teammates, the clock).
(() => {
  'use strict';
  const { html, icon, ANALYSTS, CATS, ME, SAMPLE_EMAILS, TEAMMATES, actionsFor, analyze, approveRoute, buildData, catLabel, diffRoute, overrideRoute, queueOf, withWork } = W2W;
  const V = W2W; // view functions


  const ME_LABEL = 'A. Analyst (you)';
  const SIM_INTERVAL = 9000;
  // Live updates are always on; the header shows when the queue last changed.
  const SPLITTER = 16;
  /** Panel's share of the workspace; the list and the panel start out equal. */
  const PANEL_RATIO_DEFAULT = 0.5;
  const PANEL_MIN = 360;
  const LIST_MIN = 440;
  const PANEL_KEY = 'iwre.panelRatio';
  const KPIS_HIDDEN_KEY = 'iwre.kpisHidden';
  const TABS = ['ready', 'review', 'resolved'];

  /* ---------- Per-browser preferences (storage may be unavailable; the app works without it) ---------- */

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* preference just won't persist */ }
    },
  };
  const readPanelRatio = () => {
    const v = Number(store.get(PANEL_KEY));
    return v > 0 && v < 1 ? v : PANEL_RATIO_DEFAULT;
  };

  /* ---------- State ---------- */

  const state = {
    reqs: buildData(),
    tab: 'ready',
    query: '',
    selectedId: null,
    collapsed: false,
    panelRatio: readPanelRatio(),
    workspaceWidth: 0,
    /** Open override form: { id, route, note } — edited in place without re-rendering the panel. */
    override: null,
    cleared: 0,
    loading: true,
    toast: null,
    /** Ingest modal: { text, running, step, preview }. `text` is edited in place. */
    ingest: null,
    lastUpdated: Date.now(),
    lastEvent: null,
    refreshing: false,
    /** Applies across tabs; the Filters button shows how many are on. */
    filters: { pri: [], cat: [], waiting: false },
    /** Sort per tab, so each queue keeps its own order. */
    sort: { ready: 'risk', review: 'risk', resolved: 'decided' },
    flashId: null,
    kpisHidden: store.get(KPIS_HIDDEN_KEY) === '1',
    /** Open popover: 'shortcuts' | 'account' | 'filters' | null. */
    pop: null,
  };
  let undoSnapshot = null;
  let nextId = 2060;
  let toastTimer;
  let simTimer;

  const $ = (id) => document.getElementById(id);
  const findReq = (id) => state.reqs.find((r) => r.id === id);

  function setState(patch) {
    Object.assign(state, patch);
    render();
  }

  /** Replace the request list; any data change, yours or a teammate's, bumps "Queue updated". */
  function setReqs(reqs) {
    state.reqs = reqs;
    state.lastUpdated = Date.now();
  }
  const updateReq = (id, fn) => setReqs(state.reqs.map((x) => (x.id === id ? fn(x) : x)));

  /* ---------- Derived data ---------- */

  function byQueue() {
    const q = { ready: [], review: [], resolved: [] };
    for (const r of state.reqs) q[queueOf(r)].push(r);
    return q;
  }

  const SORT_FNS = {
    // Risk = priority first, then the AI's least confident suggestions, then newest.
    risk: (a, b) => a.cur.pri.localeCompare(b.cur.pri) || a.conf - b.conf || a.age - b.age,
    newest: (a, b) => a.age - b.age,
    oldest: (a, b) => b.age - a.age,
    confidence: (a, b) => a.conf - b.conf || a.age - b.age,
    decided: (a, b) => b.updatedAt - a.updatedAt,
  };

  /** Everything searchable about a ticket, including the people who touched it. */
  const haystack = (r) => [
    r.id, r.title, r.desc, r.cur.queue, r.cur.group, catLabel(r.cur.cat), r.human?.by,
    ...r.activity.map((a) => (a.who === 'ai' ? '' : ANALYSTS[a.who].name)),
  ].join(' ').toLowerCase();

  function passesFilters(r) {
    const f = state.filters;
    return (!f.pri.length || f.pri.includes(r.cur.pri)) && (!f.cat.length || f.cat.includes(r.cur.cat)) && (!f.waiting || r.work === 'waiting');
  }

  function visibleList(queues) {
    let L = queues[state.tab].filter(passesFilters);
    L.sort(SORT_FNS[state.sort[state.tab]]);
    L.sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew));
    const q = state.query.trim().toLowerCase();
    if (q) L = L.filter((r) => haystack(r).includes(q));
    return L;
  }

  let list = [];
  /** Approving or overriding moves a ticket to Resolved, so outside that tab it animates out of the list. */
  const leavesList = () => state.tab !== 'resolved';
  const panelShows = (id) => !state.collapsed && state.selectedId === id;

  /* ---------- Rendering ---------- */

  /** Re-renders a region, then puts keyboard focus back on the same element if it was inside it. */
  function patch(el, markup) {
    const active = document.activeElement;
    const refocus = active && active !== document.body && el.contains(active) && active.id ? active.id : null;
    el.innerHTML = String(markup);
    if (refocus) document.getElementById(refocus)?.focus({ preventScroll: true });
  }

  const last = {};
  const sameKey = (a, b) =>
    a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]));
  /** Runs `fn` only when `key` (a value, or an array compared item by item) changed since this region last rendered. */
  function memo(region, key, fn) {
    if (region in last && sameKey(last[region], key)) return;
    last[region] = key;
    fn();
  }

  function render() {
    const queues = byQueue();
    list = visibleList(queues);

    // The breakdown panel always shows a ticket from the current tab: when the open ticket isn't in this list
    // (first load, tab switch, search, a teammate's change), fall back to the list's first ticket.
    if (!state.loading && !list.some((r) => r.id === state.selectedId)) state.selectedId = list[0]?.id ?? null;
    const selected = state.selectedId ? findReq(state.selectedId) ?? null : null;

    memo('kpis', [state.reqs, state.cleared, state.loading, state.kpisHidden], () => {
      $('kpi-band').classList.toggle('is-hidden', state.kpisHidden);
      patch($('kpi-band'), V.kpiBand(state));
    });

    memo('tabs', `${state.tab}|${queues.ready.length}|${queues.review.length}|${queues.resolved.length}`, () => {
      patch($('tabs'), V.tabs(state.tab, { ready: queues.ready.length, review: queues.review.length, resolved: queues.resolved.length }));
    });

    const ing = state.ingest;
    const filtered = V.filterCount(state.filters) > 0;
    memo('meta', [state.tab, list.length, queues[state.tab].length, state.sort[state.tab]], () => {
      patch($('list-meta'), V.listMeta({ tab: state.tab, shown: list.length, total: queues[state.tab].length, sort: state.sort[state.tab] }));
    });
    memo('filters', [state.filters], () => {
      patch($('filters-btn'), V.filtersButton(state.filters));
      $('filters-btn').classList.toggle('is-active', filtered);
      patch($('pop-filters'), V.filtersCard(state.filters));
    });

    memo('cards', [state.selectedId, state.flashId, state.loading, ing?.running && ing.step, state.query, filtered, ...list], () => {
      let markup;
      if (state.loading) markup = html`${V.skeletonCard()}${V.skeletonCard()}${V.skeletonCard()}`;
      else {
        const running = ing?.running ? V.skeletonCard(`Running pipeline… step ${ing.step}/6`) : '';
        const cards = list.length
          ? list.map((r) => V.card(r, { active: r.id === state.selectedId, flash: r.id === state.flashId }))
          : V.emptyState({ tab: state.tab, query: state.query, filtered });
        markup = html`${running}${cards}`;
      }
      patch($('cards'), markup);
    });

    memo('detail', [selected, state.collapsed, state.override?.id === selected?.id && state.override?.id], () => {
      const aside = $('detail');
      const body = aside.querySelector('.detail-body');
      const keepScroll = body && aside.dataset.req === selected?.id ? body.scrollTop : 0;
      aside.className = `detail-col${state.collapsed ? ' is-collapsed' : ''}`;
      aside.setAttribute('aria-label', state.collapsed ? 'Ticket breakdown (collapsed)' : selected ? `Ticket breakdown for ${selected.id}` : 'Ticket breakdown');
      aside.dataset.req = selected?.id ?? '';
      const draft = state.override && selected && state.override.id === selected.id ? state.override : null;
      patch(aside, V.detailPanel({ req: selected, collapsed: state.collapsed, overrideDraft: draft }));
      const newBody = aside.querySelector('.detail-body');
      if (newBody) newBody.scrollTop = keepScroll;
    });

    memo('modal', [ing], () => {
      patch($('modal-root'), ing ? V.ingestModal(ing) : '');
    });

    memo('toast', [state.toast], () => patch($('toast'), V.toast(state.toast)));

    memo('refresh', state.refreshing, () => patch($('refresh-slot'), V.refreshButton(state.refreshing)));
    renderLiveText();
    renderLayout();
  }

  function renderLiveText() {
    const el = $('live-text');
    el.innerHTML = String(V.liveText(state));
    el.title = state.lastEvent ? `Latest: ${state.lastEvent}` : '';
  }

  /* ---------- Split layout ---------- */

  function layout() {
    const splitSpace = Math.max(0, state.workspaceWidth - SPLITTER);
    const panelMax = Math.max(PANEL_MIN, splitSpace - LIST_MIN);
    const width = Math.round(Math.min(panelMax, Math.max(PANEL_MIN, state.panelRatio * splitSpace)));
    return { splitSpace, panelMax, width };
  }

  function renderLayout() {
    const ws = $('workspace');
    const split = $('splitter');
    ws.classList.toggle('is-collapsed', state.collapsed);
    split.style.display = state.collapsed ? 'none' : '';
    if (state.collapsed) {
      ws.style.gridTemplateColumns = '';
      return;
    }
    const { panelMax, width } = layout();
    ws.style.gridTemplateColumns = `minmax(0, 1fr) ${SPLITTER}px ${width}px`;
    split.setAttribute('aria-valuenow', width);
    split.setAttribute('aria-valuemin', PANEL_MIN);
    split.setAttribute('aria-valuemax', panelMax);
  }

  /** Stores the split as a ratio so it keeps its proportions when the window resizes. */
  function setPanelWidth(w) {
    const { splitSpace } = layout();
    if (!splitSpace) return;
    state.panelRatio = w / splitSpace;
    store.set(PANEL_KEY, String(state.panelRatio));
    renderLayout();
  }
  function resetPanel() {
    state.panelRatio = PANEL_RATIO_DEFAULT;
    store.set(PANEL_KEY, String(state.panelRatio));
    renderLayout();
  }

  function initSplitter() {
    const el = $('splitter');
    const STEP = 24;
    let drag = null;
    let lastDown = 0;
    const clamp = (w) => {
      const { panelMax } = layout();
      return Math.round(Math.min(panelMax, Math.max(PANEL_MIN, w)));
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // Pointer capture suppresses native dblclick, so detect it from timing.
      if (e.timeStamp - lastDown < 350) {
        lastDown = 0;
        resetPanel();
        return;
      }
      lastDown = e.timeStamp;
      el.setPointerCapture(e.pointerId);
      drag = { startX: e.clientX, startW: layout().width };
      document.body.classList.add('is-resizing');
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = drag.startX - e.clientX;
      if (Math.abs(dx) > 3) lastDown = 0; // a real drag never counts toward a double-click
      setPanelWidth(clamp(drag.startW + dx));
    });
    const end = (e) => {
      if (!drag) return;
      drag = null;
      el.releasePointerCapture(e.pointerId);
      document.body.classList.remove('is-resizing');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      const { width, panelMax } = layout();
      const step = e.shiftKey ? STEP * 4 : STEP;
      if (e.key === 'ArrowLeft') setPanelWidth(clamp(width + step));
      else if (e.key === 'ArrowRight') setPanelWidth(clamp(width - step));
      else if (e.key === 'Home') setPanelWidth(panelMax);
      else if (e.key === 'End') setPanelWidth(PANEL_MIN);
      else if (e.key === 'Enter') resetPanel();
      else return;
      e.preventDefault();
      e.stopPropagation();
    });

    new ResizeObserver(([entry]) => {
      state.workspaceWidth = entry.contentRect.width;
      renderLayout();
    }).observe($('workspace'));
  }

  /* ---------- Actions ---------- */

  function showToast(msg, undo, ms = 6000) {
    clearTimeout(toastTimer);
    state.toast = { msg, undo };
    toastTimer = setTimeout(() => {
      undoSnapshot = null;
      setState({ toast: null });
    }, ms);
  }

  function snapshot() {
    undoSnapshot = { reqs: state.reqs, cleared: state.cleared };
  }

  function undo() {
    if (undoSnapshot) {
      setReqs(undoSnapshot.reqs);
      state.cleared = undoSnapshot.cleared;
      undoSnapshot = null;
    }
    showToast('Action undone', false, 2500);
    render();
  }

  function focusCard(id) {
    if (!id) return;
    requestAnimationFrame(() => {
      const el = document.getElementById(`t-${id}`);
      el?.focus();
      el?.closest('.card')?.scrollIntoView({ block: 'nearest' });
    });
  }

  function select(id) {
    if (id !== state.selectedId && state.override?.id !== id) state.override = null;
    setState({ selectedId: id, collapsed: false });
  }

  function flash(id) {
    state.flashId = id;
    setTimeout(() => {
      if (state.flashId === id) setState({ flashId: null });
    }, 2200);
  }

  /** After a ticket leaves the list, open its neighbour in the panel and move focus there. */
  function neighbourOf(id) {
    const idx = list.findIndex((x) => x.id === id);
    return (list[idx + 1] ?? list[idx - 1])?.id;
  }
  function moveOnFrom(id, nextIdForId) {
    if (!leavesList() || !nextIdForId) return;
    if (state.selectedId === id) state.selectedId = nextIdForId;
    focusCard(nextIdForId);
  }

  function approve(id) {
    const r = findReq(id);
    if (!r || r.human) return;
    const next = neighbourOf(id);
    snapshot();
    const commit = () => {
      updateReq(id, (x) => approveRoute(x, ME, ME_LABEL));
      state.lastEvent = `You approved ${id}`;
      if (r.status === 'NR') state.cleared += 1;
      state.override = null;
      showToast(html`<b>${id}</b> route approved → ${r.cur.queue}`, true);
      moveOnFrom(id, next);
      render();
    };
    if (leavesList()) {
      document.querySelector(`[data-card="${CSS.escape(id)}"]`)?.classList.add('is-leaving');
      setTimeout(commit, 220);
    } else commit();
  }

  function saveOverride(id) {
    const r = findReq(id);
    const draft = state.override;
    if (!r || !draft || draft.id !== id) return;
    const changes = diffRoute(r.cur, draft.route);
    const note = draft.note.trim();
    if (!changes.length || note.length < 10) return;
    const next = neighbourOf(id);
    snapshot();
    updateReq(id, (x) => overrideRoute(x, ME, ME_LABEL, { ...draft.route }, note, changes));
    state.lastEvent = `You overrode ${id}`;
    if (r.status === 'NR') state.cleared += 1;
    state.override = null;
    showToast(html`<b>${id}</b> overridden → ${draft.route.queue}`, true);
    moveOnFrom(id, next);
    render();
  }

  function toggleOverride(id) {
    const r = findReq(id);
    if (state.override?.id === id) state.override = null;
    else state.override = { id, route: { ...r.cur }, note: '' };
    render();
    if (state.override) requestAnimationFrame(() => $('ovr-first')?.focus());
  }

  const WORK_VERBS = {
    requestInfo: { verb: 'requested info on', run: (r) => withWork(r, 'waiting', ME, `Requested ${r.missing.join(', ')} from requester`) },
    infoReceived: { verb: 'resumed', run: (r) => withWork(r, 'open', ME, 'Requester info received') },
  };

  function handleAction(id, action) {
    const r = findReq(id);
    if (!r || !actionsFor(r).includes(action)) return;
    if (action === 'approve') return approve(id);
    if (action === 'override') return toggleOverride(id);
    const op = WORK_VERBS[action];
    if (!op) return;
    snapshot();
    updateReq(id, op.run);
    state.lastEvent = `You ${op.verb} ${id}`;
    showToast(html`You ${op.verb} <b>${id}</b>`, true);
    render();
  }

  /* ---------- Ingest ---------- */

  function openIngest() {
    setState({ ingest: { text: SAMPLE_EMAILS.complete, running: false, step: 0, preview: null } });
    requestAnimationFrame(() => $('ingest-text')?.focus());
  }
  function closeIngest() {
    if (state.ingest && !state.ingest.running) setState({ ingest: null });
  }

  function runIngest() {
    const ing = state.ingest;
    if (!ing || ing.running || !ing.text.trim()) return;
    const id = `REQ-${nextId++}`;
    const r = analyze(ing.text, id);
    setState({ ingest: { ...ing, running: true, step: 0, preview: r } });
    let step = 0;
    const tick = () => {
      step++;
      if (step <= 6) {
        setState({ ingest: { ...state.ingest, step } });
        setTimeout(tick, 320);
        return;
      }
      setReqs([{ ...r, isNew: true }, ...state.reqs]);
      state.ingest = null;
      state.tab = queueOf(r);
      state.query = '';
      $('search').value = '';
      showToast(r.status === 'AR' ? html`<b>${id}</b> ingested · AI suggests ${r.cur.queue}` : html`<b>${id}</b> ingested · needs review`, false);
      select(id);
      setTimeout(() => {
        state.reqs = state.reqs.map((x) => (x.id === id ? { ...x, isNew: false } : x));
        render();
      }, 2400);
    };
    setTimeout(tick, 320);
  }

  /* ---------- Live updates ---------- */

  /** Simulated teammates working the same queue. */
  function simTick() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const who = pick(TEAMMATES);
    const name = ANALYSTS[who].name;
    // Leave alone whatever you're looking at or editing.
    const busy = (r) => r.id === state.override?.id || r.id === state.selectedId;
    // Mostly confident routes get approved; now and then someone clears a review ticket.
    const routed = state.reqs.filter((r) => !r.human && r.status === 'AR' && !busy(r));
    const review = state.reqs.filter((r) => !r.human && r.status === 'NR' && r.work === 'open' && !busy(r));
    const pool = Math.random() < 0.6 && routed.length ? routed : review;
    if (!pool.length) return;
    const target = pick(pool).id;
    updateReq(target, (x) => approveRoute(x, who, name));
    state.lastEvent = `${name} approved ${target}`;
    flash(target);
    render();
  }

  function startSim() {
    clearInterval(simTimer);
    simTimer = setInterval(simTick, SIM_INTERVAL);
  }

  function refresh() {
    setState({ refreshing: true });
    setTimeout(() => setState({ refreshing: false, lastUpdated: Date.now() }), 500);
  }

  /* ---------- Header popovers ---------- */

  function setPop(name) {
    state.pop = name;
    for (const root of document.querySelectorAll('[data-pop-root]')) {
      const open = root.dataset.popRoot === name;
      const btn = root.querySelector('[data-pop]');
      btn.setAttribute('aria-expanded', String(open));
      btn.classList.toggle('is-open', open);
      root.querySelector('.account-card').hidden = !open;
    }
  }

  /* ---------- Events ---------- */

  function onClick(e) {
    const t = e.target;

    const popBtn = t.closest('[data-pop]');
    if (popBtn) return setPop(state.pop === popBtn.dataset.pop ? null : popBtn.dataset.pop);
    if (state.pop && !t.closest('[data-pop-root]')) setPop(null);

    const tabBtn = t.closest('[data-tab]');
    if (tabBtn) {
      state.override = null;
      return setState({ tab: tabBtn.dataset.tab });
    }

    const act = t.closest('[data-act]');
    if (act) return handleAction(act.dataset.id, act.dataset.act);

    const cmdEl = t.closest('[data-cmd]');
    const cmd = cmdEl?.dataset.cmd;
    if (cmd === 'ingest-backdrop' && t !== cmdEl) {
      // Clicks inside the dialog bubble up to the backdrop; only a click on the backdrop itself closes it.
    } else if (cmd) {
      switch (cmd) {
        case 'toggle-kpis':
          store.set(KPIS_HIDDEN_KEY, state.kpisHidden ? '0' : '1');
          return setState({ kpisHidden: !state.kpisHidden });
        case 'refresh': return refresh();
        case 'collapse': return setState({ collapsed: true });
        case 'expand': return setState({ collapsed: false });
        case 'clear-filters':
          return setState({ filters: { pri: [], cat: [], waiting: false } });
        case 'clear-search':
          $('search').value = '';
          return setState({ query: '' });
        case 'ovr-cancel': {
          const id = state.override?.id;
          setState({ override: null });
          return focusCard(id);
        }
        case 'ingest-open': return openIngest();
        case 'ingest-close': return closeIngest();
        case 'ingest-backdrop': return closeIngest();
        case 'ingest-sample':
          setState({ ingest: { ...state.ingest, text: SAMPLE_EMAILS[cmdEl.dataset.sample] } });
          return $('ingest-text')?.focus();
        case 'ingest-run': return runIngest();
        case 'undo': return undo();
        case 'toast-dismiss': return setState({ toast: null });
      }
    }

    const open = t.closest('#cards [data-open]');
    if (open) select(open.dataset.open);
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === 'search') return setState({ query: t.value });
    if (t.id === 'sort') return setState({ sort: { ...state.sort, [state.tab]: t.value } });

    const group = t.dataset.filter;
    if (group) {
      const f = { ...state.filters };
      if (group === 'waiting') f.waiting = t.checked;
      else f[group] = t.checked ? [...new Set([...f[group], t.value])] : f[group].filter((v) => v !== t.value);
      return setState({ filters: f });
    }

    if (t.id === 'ingest-text' && state.ingest) {
      state.ingest.text = t.value; // edited in place: no re-render while typing
      $('ingest-run').disabled = state.ingest.running || !t.value.trim();
      return;
    }

    const field = t.dataset.ovr;
    if (field && state.override) {
      const draft = state.override;
      if (field === 'cat') {
        draft.route = { ...draft.route, cat: t.value, queue: CATS[t.value].queue, group: CATS[t.value].group };
        document.querySelector('[data-ovr="queue"]').value = draft.route.queue;
        document.querySelector('[data-ovr="group"]').value = draft.route.group;
      } else if (field === 'note') draft.note = t.value;
      else draft.route = { ...draft.route, [field]: t.value };
      const req = findReq(draft.id);
      $('ovr-diff').innerHTML = String(V.overrideDiff(req, draft));
      $('ovr-save').disabled = !V.canSaveOverride(req, draft);
    }
  }

  function onSubmit(e) {
    if (e.target.id !== 'ovr-form') return;
    e.preventDefault();
    saveOverride(state.override?.id);
  }

  function onTabKey(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(state.tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    state.override = null;
    setState({ tab: next });
    $(`tab-${next}`)?.focus();
  }

  /** Header popovers swallow Escape so it doesn't also close the panel behind them. */
  function onKeyCapture(e) {
    if (e.key === 'Escape' && state.pop) {
      e.stopPropagation();
      setPop(null);
    }
  }

  function onKey(e) {
    const t = e.target;
    const typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName);

    if (e.key === 'Escape') {
      if (state.ingest && !state.ingest.running) return closeIngest();
      if (state.override) {
        const id = state.override.id;
        setState({ override: null });
        return focusCard(id);
      }
      if (!state.collapsed) return setState({ collapsed: true });
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || state.ingest) return;

    if (e.key === '?') {
      e.preventDefault();
      return setPop(state.pop === 'shortcuts' ? null : 'shortcuts');
    }
    const curId = t.closest?.('[data-card]')?.dataset.card ?? state.selectedId ?? undefined;
    if (e.key === '/') {
      e.preventDefault();
      $('search').focus();
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
      else if (actionsFor(findReq(curId)).includes('override') && state.override?.id !== curId) toggleOverride(curId);
    } else if (e.key === ']') {
      setState({ collapsed: !state.collapsed });
    }
  }

  /* ---------- Boot ---------- */

  function init() {
    // Static icons declared in index.html as <span data-icon="name" data-size="sm">.
    for (const el of document.querySelectorAll('[data-icon]')) el.outerHTML = String(icon(el.dataset.icon, el.dataset.size || 'md'));
    $('pop-shortcuts').innerHTML = String(V.shortcutsCard());
    $('pop-account').innerHTML = String(V.accountCard());

    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onInput);
    document.addEventListener('submit', onSubmit);
    $('tabs').addEventListener('keydown', onTabKey);
    window.addEventListener('keydown', onKeyCapture, true);
    window.addEventListener('keydown', onKey);
    initSplitter();

    setInterval(renderLiveText, 1000);
    render();
    setTimeout(() => {
      setState({ loading: false });
      startSim();
    }, 700);
  }

  init();
})();
