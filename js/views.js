// Render functions: each returns markup (via `html`, which escapes interpolated text).
// Interactive elements carry data-* attributes; app.js handles them with delegated listeners.
(() => {
  'use strict';
  const { html, icon, ANALYSTS, CATS, CAT_INFO, CAT_KEYS, GROUPS, ME, MISSING_PENALTY, PRIORITIES, PRI_LABEL, QUEUES, SYN, TEAMMATES, THRESHOLD, actionsFor, analystName, catLabel, clock, clockSec, confBand, diffRoute, kwScore, pipelineSteps } = W2W;


  /* ---------- Badges ---------- */

  const STATUS = {
    AR: { cls: 'ar', icon: 'checkCircle', label: 'Auto-route suggested', code: 'AUTO_ROUTE_SUGGESTED' },
    NR: { cls: 'nr', icon: 'alert', label: 'Needs review', code: 'NEEDS_REVIEW' },
    OV: { cls: 'ov', icon: 'userEdit', label: 'Overridden', code: 'OVERRIDDEN' },
    HA: { cls: 'ha', icon: 'userCheck', label: 'Automated route approved', code: 'HUMAN_APPROVED' },
  };
  /** How a human decision reads everywhere: approve = AI route accepted unchanged; override = analyst changed it. */
  const decisionLabel = (h) => (h.action === 'override' ? 'Overridden' : 'Automated route approved');
  const statusLabel = (s) => STATUS[s].label;
  const statusClass = (s) => STATUS[s].cls;

  /** Pass `human` to name who made the call and when, e.g. "Overridden by K. Lee · 4:11 PM". */
  function statusBadge(status, human) {
    const m = STATUS[status];
    return html`<span class="status status--${m.cls}" title="${m.code}">${icon(m.icon, 'sm')}${m.label}${human && html`<span class="status-by"> by <b>${human.by}</b> · ${human.at}</span>`}</span>`;
  }

  function priorityTag(priority) {
    const bars = 5 - Number(priority[1]);
    return html`<span class="prio prio--${priority.toLowerCase()}" title="Priority ${priority} – ${PRI_LABEL[priority]}"><span class="bars" aria-hidden="true">${[1, 2, 3, 4].map((i) => html`<i class="${i <= bars ? 'on' : ''}"></i>`)}</span><b>${priority}</b> ${PRI_LABEL[priority]}</span>`;
  }

  const meterLabel = (value, pass) => `AI confidence ${value} percent; threshold ${THRESHOLD} percent; ${pass ? 'above' : 'below'} threshold`;

  /* ---------- Rationale ---------- */

  function rationaleText(r) {
    const c = CATS[r.ai.cat];
    const n = r.kw.length;
    const match = n >= 3 ? html`Strong match to <b>${c.type}</b> on ${n} keywords.`
      : n === 2 ? html`Moderate match to <b>${c.type}</b> on 2 keywords.`
      : n === 1 ? html`Weak match: only “${r.kw[0]}” matched, so <b>${c.type}</b> is uncertain.`
      : html`No category keywords matched.`;
    return html`${match}${r.sig ? ` “${r.sig}” suggests ${r.ai.pri}.` : ` No urgency signal, so it suggests the default ${r.ai.pri}.`}${r.missing.length ? ` Required field${r.missing.length > 1 ? 's' : ''} missing.` : ' All required fields present.'}${r.ai.status === 'AR'
      ? ` ${r.conf}% clears the ${THRESHOLD}% threshold, so it suggests routing to ${c.queue}.`
      : ` ${r.conf}% is below ${THRESHOLD}%, so it needs a person to review.`}`;
  }

  /* ---------- Work state ---------- */

  function avatar(id, size = 'sm', online = false) {
    if (!id) return html`<span class="avatar-chip avatar-chip--${size} avatar-chip--empty" aria-hidden="true"></span>`;
    const a = ANALYSTS[id];
    return html`<span class="avatar-chip avatar-chip--${size} hue-${a.hue}" title="${a.name}${id === ME ? ' (you)' : ''}">${a.initials}${online && html`<span class="presence" aria-hidden="true"></span>`}</span>`;
  }

  /** Footer status line; only a ticket waiting on its requester has one. */
  function workLine(r) {
    if (r.work !== 'waiting') return '';
    const last = r.activity[r.activity.length - 1];
    return html`<span class="workline workline--waiting">${icon('hourglass', 'xs')}<span class="workline-text">Awaiting requester${r.missing.length > 0 && html` for <b>${r.missing.join(', ')}</b>`} · since ${clock(last.at)}</span></span>`;
  }

  const ACTION_META = {
    approve: { label: 'Approve / Route', icon: 'check', kind: 'primary' },
    override: { label: 'Override', icon: 'userEdit', kind: 'secondary' },
    requestInfo: { label: 'Request info', icon: 'hourglass', kind: 'secondary' },
    infoReceived: { label: 'Info received', icon: 'check', kind: 'secondary' },
  };

  /* ---------- Header ---------- */

  const since = (now, t) => {
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 5) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ${m % 60}m ago`;
  };

  /** Live status text in the header centre; re-rendered every second on its own. */
  function liveText({ lastUpdated: at }) {
    return html`<b>Live</b><span class="lu-sep"></span>Queue updated <time datetime="${new Date(at).toISOString()}" title="${new Date(at).toLocaleString()}">${clockSec(at)}</time><span class="lu-ago"> · ${since(Date.now(), at)}</span>`;
  }

  function refreshButton(refreshing) {
    return html`<button class="btn btn-ghost btn-icon" data-cmd="refresh" aria-label="Refresh queue" title="Refresh queue" ${refreshing && 'disabled'}>${icon(refreshing ? 'loader' : 'refresh')}</button>`;
  }

  const SHORTCUTS = [
    [['J', 'K'], 'Move between tickets'],
    [['A'], 'Approve AI route'],
    [['O'], 'Override'],
    [[']'], 'Toggle details panel'],
    [['/'], 'Search'],
    [['Esc'], 'Close'],
    [['?'], 'Show shortcuts'],
  ];

  function shortcutsCard() {
    return html`
      <div class="account-section"><span class="account-section-label">Keyboard shortcuts</span></div>
      <ul class="shortcuts">
        ${SHORTCUTS.map(([keys, label]) => html`<li><span class="shortcuts-keys">${keys.map((k) => html`<kbd class="kbd">${k}</kbd>`)}</span><span>${label}</span></li>`)}
      </ul>`;
  }

  function accountCard() {
    return html`
      <div class="account-me">
        ${avatar(ME, 'md', true)}
        <div class="account-me-text"><b>${ANALYSTS[ME].name}</b><span>Operations Analyst</span></div>
      </div>
      <div class="account-section">
        <span class="account-section-label">Team on shift</span>
        <span class="account-section-count">${TEAMMATES.length} online</span>
      </div>
      <ul class="account-team">
        ${TEAMMATES.map((id) => html`<li class="account-member">${avatar(id, 'sm', true)}<span class="account-member-name">${ANALYSTS[id].name}</span></li>`)}
      </ul>`;
  }

  /* ---------- KPIs ---------- */

  const MINUTES_PER_AUTO_ROUTE = 7;

  function kpiBand({ reqs, cleared, loading, kpisHidden }) {
    const total = reqs.length;
    const auto = reqs.filter((r) => r.ai.status === 'AR').length;
    const review = reqs.filter((r) => r.status === 'NR').length;
    const pct = ((auto / total) * 100).toFixed(1);

    const summary = loading
      ? 'Loading…'
      : html`<b>${total}</b> total · <b>${auto}</b> auto-route suggested · <b class="kpi-band-warn">${review}</b> needs review · <b>96.7%</b> accuracy · <b>${auto * MINUTES_PER_AUTO_ROUTE}</b> min saved`;

    const cards = loading
      ? Array.from({ length: 5 }, () => html`
          <div class="kpi">
            <div class="skel" style="height: 12px; width: 50%"></div>
            <div class="skel" style="height: 28px; width: 70%; margin-top: 6px"></div>
            <div class="skel" style="height: 10px; width: 80%; margin-top: 4px"></div>
          </div>`)
      : html`
          <div class="kpi" role="listitem">
            <span class="kpi-label">${icon('layers', 'sm')}Total requests</span>
            <span class="kpi-value">${total}</span>
            <span class="kpi-sub">Approved Marketplace tickets · today</span>
          </div>
          <div class="kpi" role="listitem">
            <span class="kpi-label">${icon('checkCircle', 'sm')}Auto-route suggested</span>
            <span class="kpi-value">${auto}<small>${pct}%</small></span>
            <div class="kpi-bar" aria-hidden="true"><i style="width: ${pct}%"></i></div>
            <span class="kpi-sub">Confidence ≥ ${THRESHOLD}% and complete</span>
          </div>
          <div class="kpi kpi--warn" role="listitem">
            <span class="kpi-label">${icon('alert', 'sm')}Needs review</span>
            <span class="kpi-value">${review}</span>
            <span class="kpi-sub">${cleared ? html`<span class="kpi-delta">−${cleared} cleared</span> this session` : 'In exception queue'}</span>
          </div>
          <div class="kpi" role="listitem">
            <span class="kpi-label">${icon('target', 'sm')}Accuracy</span>
            <span class="kpi-value">96.7%</span>
            <span class="kpi-sub">vs human-labeled set (58/60)</span>
          </div>
          <div class="kpi" role="listitem">
            <span class="kpi-label">${icon('clock', 'sm')}Minutes saved</span>
            <span class="kpi-value">${auto * MINUTES_PER_AUTO_ROUTE}</span>
            <span class="kpi-sub">≈ ${MINUTES_PER_AUTO_ROUTE} min manual triage × ${auto}</span>
          </div>`;

    return html`
      <div class="kpi-band-head">
        <span class="kpi-band-title">Today's overview</span>
        ${kpisHidden && html`<span class="kpi-band-summary">${summary}</span>`}
        <button class="kpi-band-toggle" data-cmd="toggle-kpis" aria-expanded="${!kpisHidden}" aria-controls="kpi-grid">
          ${kpisHidden ? 'Show stats' : 'Hide stats'}${icon(kpisHidden ? 'chevronDown' : 'chevronUp', 'sm')}
        </button>
      </div>
      ${!kpisHidden && html`<div class="kpis" id="kpi-grid" role="${loading ? 'presentation' : 'list'}">${cards}</div>`}`;
  }

  /* ---------- Tabs ---------- */

  function tabs(tab, counts) {
    const t = (key, ico, label, title, countCls = '') => html`
      <button class="tab" role="tab" id="tab-${key}" data-tab="${key}" aria-selected="${tab === key}" tabindex="${tab === key ? 0 : -1}" title="${title}">
        ${icon(ico, 'sm')}${label} <span class="tab-count ${countCls}">${counts[key]}</span>
      </button>`;
    return html`
      ${t('ready', 'workflow', 'Ready to route', `AI confidence ≥ ${THRESHOLD}% and all required fields present`)}
      ${t('review', 'alert', 'Needs review', `AI confidence below ${THRESHOLD}% or required fields missing`, 'tab-count--warn')}
      ${t('resolved', 'checkCircle', 'Resolved', 'Decided by an analyst: AI route approved as-is, or overridden')}`;
  }

  /* ---------- List meta: count + sort, and the filter popover ---------- */

  const SORTS = {
    risk: 'Risk, then newest',
    newest: 'Newest first',
    oldest: 'Oldest first',
    confidence: 'Lowest confidence first',
    decided: 'Recently decided',
  };
  const sortsFor = (tab) => (tab === 'resolved' ? ['decided', 'risk', 'newest', 'oldest'] : ['risk', 'newest', 'oldest', 'confidence']);

  const COUNT_TEXT = {
    ready: (n) => `${n} ticket${n === 1 ? '' : 's'} ready to route`,
    review: (n) => `${n} ticket${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} a decision`,
    resolved: (n) => `${n} resolved ticket${n === 1 ? '' : 's'}`,
  };

  function listMeta({ tab, shown, total, sort }) {
    const count = shown === total ? COUNT_TEXT[tab](total) : `${shown} of ${COUNT_TEXT[tab](total)}`;
    return html`
      <span class="list-count">${count}</span>
      <label class="sort">
        <span class="sort-label">Sort:</span>
        <select id="sort" aria-label="Sort tickets">${sortsFor(tab).map((k) => html`<option value="${k}" ${k === sort && 'selected'}>${SORTS[k]}</option>`)}</select>
        ${icon('chevronDown', 'sm')}
      </label>`;
  }

  const filterCount = (f) => f.pri.length + f.cat.length + (f.waiting ? 1 : 0);

  function filtersButton(filters) {
    const n = filterCount(filters);
    return html`${icon('sliders')}Filters${n > 0 && html`<span class="filters-badge">${n}</span>`}`;
  }

  function filtersCard(f) {
    const chk = (group, value, label, on) => html`<label class="fopt"><input type="checkbox" id="f-${group}-${value}" data-filter="${group}" value="${value}" ${on && 'checked'}><span>${label}</span></label>`;
    return html`
      <div class="account-section"><span class="account-section-label">Priority</span></div>
      <div class="fgroup fgroup--row">${PRIORITIES.map((p) => chk('pri', p, `${p} ${PRI_LABEL[p]}`, f.pri.includes(p)))}</div>
      <div class="account-section"><span class="account-section-label">Category</span></div>
      <div class="fgroup">${CAT_KEYS.map((k) => chk('cat', k, catLabel(k), f.cat.includes(k)))}</div>
      <div class="account-section"><span class="account-section-label">Status</span></div>
      <div class="fgroup">${chk('waiting', '1', 'Awaiting requester', f.waiting)}</div>
      <div class="filters-foot"><button class="btn btn-ghost btn-sm" data-cmd="clear-filters" ${!filterCount(f) && 'disabled'}>Clear all</button></div>`;
  }

  /* ---------- Cards ---------- */

  /** Card-level confidence block: tinted by pass/fail, with the auto-route threshold marked on the bar. */
  function confidencePanel(value) {
    const pass = value >= THRESHOLD;
    return html`
      <div class="conf conf--${pass ? 'pass' : 'fail'}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" aria-label="${meterLabel(value, pass)}">
        <div class="conf-head"><span class="conf-label">${icon('gauge')}Confidence</span><span class="conf-val">${value}%</span></div>
        <div class="conf-track"><div class="conf-fill" style="width: ${value}%"></div><div class="conf-thresh" style="left: ${THRESHOLD}%"></div></div>
      </div>`;
  }

  /** Read-only summary; every action lives in the breakdown panel that opens on click. */
  function card(r, { active, flash }) {
    const pri = r.cur.pri;
    const cls = ['card', `card--${pri.toLowerCase()}`, `work--${r.work}`, active && 'is-active', (r.isNew || flash) && 'is-new'].filter(Boolean).join(' ');
    return html`
      <article class="${cls}" data-card="${r.id}" data-open="${r.id}" aria-labelledby="t-${r.id}" ${active && html`aria-current="true"`}>
        <div class="card-body">
          <header class="card-head">
            <div class="card-titleline">
              <span class="card-id">${r.id}</span>
              <button class="card-title" id="t-${r.id}" data-open="${r.id}">${r.title}</button>
              ${r.human && statusBadge(r.status, r.human)}
              ${r.isNew && html`<span class="chip chip--new">Just ingested</span>`}
            </div>
            <div class="card-head-aside">
              <span class="card-prio">${priorityTag(pri)}</span>
              <span class="card-time" title="Received">${icon('clock')}${r.received}</span>
            </div>
          </header>
          <dl class="card-fields" aria-label="Assignment details">
            <div class="card-field"><dt>Category</dt><dd>${icon('tag')}${catLabel(r.cur.cat)}</dd></div>
            <div class="card-field"><dt>Queue</dt><dd>${icon('inbox')}${r.cur.queue}</dd></div>
            <div class="card-field"><dt>Resolver</dt><dd>${icon('users')}${r.cur.group}</dd></div>
          </dl>
          <div class="card-insight">
            <div class="card-rationale">
              <span class="card-rationale-label">${icon('spark')}AI rationale</span>
              <p class="card-rationale-text">${rationaleText(r)}</p>
            </div>
            ${confidencePanel(r.conf)}
          </div>
          ${r.work === 'waiting' && html`<footer class="card-foot">${workLine(r)}</footer>`}
        </div>
      </article>`;
  }

  function skeletonCard(label) {
    return html`
      <div class="card card--skeleton" aria-busy="true">
        <div class="card-body">
          <div class="card-head">
            <div class="row">
              <div class="skel" style="height: 14px; width: 64px"></div>
              <div class="skel" style="height: 18px; width: 220px"></div>
            </div>
            <div class="card-head-aside"><div class="skel" style="height: 24px; width: 120px"></div></div>
          </div>
          <div class="card-fields">
            ${[0, 1, 2].map(() => html`<div class="card-field"><div class="skel" style="height: 10px; width: 64px"></div><div class="skel" style="height: 14px; width: 150px"></div></div>`)}
          </div>
          <div class="card-insight">
            <div class="skel" style="height: 64px"></div>
            <div class="skel" style="height: 64px"></div>
          </div>
          ${label && html`<div class="card-foot"><span class="provenance">${icon('loader', 'xs')} ${label}</span></div>`}
        </div>
      </div>`;
  }

  function emptyState({ tab, query, filtered }) {
    const box = (ico, neutral, title, body, button) => html`
      <div class="empty">
        <div class="empty-ico ${neutral ? 'empty-ico--neutral' : ''}">${icon(ico, 'lg')}</div>
        <h4>${title}</h4>
        <p>${body}</p>
        ${button}
      </div>`;
    if (filtered && !query) return box('sliders', true, 'No tickets match these filters', 'Loosen or clear the filters to see more.', html`<button class="btn btn-secondary" data-cmd="clear-filters">Clear filters</button>`);
    if (query) return box('search', true, `No requests match “${query}”`, 'Try a ticket ID, queue or resolver group.', html`<button class="btn btn-secondary" data-cmd="clear-search">Clear search</button>`);
    if (tab === 'ready') return box('checkCircle', false, 'Nothing waiting to route', 'Every confident AI recommendation has been handled. New requests appear here as they arrive.');
    if (tab === 'review') return box('checkCircle', false, 'Review queue is clear', 'Every low-confidence or incomplete request has an analyst decision.', html`<button class="btn btn-secondary" data-tab="resolved">View resolved</button>`);
    return box('userCheck', true, 'No resolved tickets yet', 'Tickets show up here once an analyst approves the AI route or overrides it.');
  }

  /* ---------- Pipeline & breakdown ---------- */

  function stepWhy(r, i) {
    const n = r.kw.length;
    switch (i) {
      case 0:
        return n ? html`${n >= 3 ? 'Strong' : n === 2 ? 'Moderate' : 'Weak'} match (${kwScore(n)}) on ${r.kw.map((k) => html` <span class="chip chip--kw">${k}</span>`)}` : 'No keywords matched';
      case 1:
        return r.sig ? html`Urgency phrase <span class="chip chip--kw">${r.sig}</span> → ${r.ai.pri}` : 'No urgency signal → P3 default';
      case 2:
        return r.missing.length ? html`Missing ${r.missing.map((m) => html`<span class="chip chip--missing">${m}</span>`)} · −${MISSING_PENALTY} pts each` : 'All required fields present';
      case 3:
        return `Category mapping: ${CATS[r.ai.cat].type} → ${r.ai.queue}`;
      case 4:
        return `Default resolver for ${r.ai.queue}`;
      default:
        return `${r.conf}% ${r.conf >= THRESHOLD ? '≥' : '<'} ${THRESHOLD}% threshold${r.missing.length ? ' · incomplete' : ''}`;
    }
  }

  /** `liveStep` renders the in-progress variant used while a request is being ingested. */
  function pipeline(r, liveStep) {
    const live = liveStep !== undefined;
    const steps = pipelineSteps(r).map((s, i) => {
      const state = live ? (i < liveStep ? (s.ok ? 'ok' : 'warn') : i === liveStep ? 'run' : 'pending') : s.ok ? 'ok' : 'warn';
      const done = state === 'ok' || state === 'warn';
      const node = state === 'ok' ? icon('check', 'sm') : state === 'warn' ? icon('alert', 'sm') : state === 'run' ? icon('loader', 'sm') : i + 1;
      return html`
        <li class="tl-step">
          <span class="tl-node tl-node--${state}" aria-hidden="true">${node}</span>
          <span class="tl-title"><span class="n">${i + 1}</span>${s.title}</span>
          <span class="tl-res">${done ? s.result : ''}</span>
          ${done && html`<span class="tl-why">${stepWhy(r, i)}</span>`}
        </li>`;
    });
    const human = !live && r.human && html`
      <li class="tl-step">
        <span class="tl-node tl-node--human" aria-hidden="true">${icon(r.human.action === 'override' ? 'userEdit' : 'userCheck', 'sm')}</span>
        <span class="tl-title"><span class="n">7</span>Human review</span>
        <span class="tl-res">${decisionLabel(r.human)}</span>
        <span class="tl-why">${r.human.by} · ${r.human.at}</span>
      </li>`;
    return html`<ol class="timeline">${steps}${human}</ol>`;
  }

  function confidenceBreakdown(r) {
    const base = kwScore(r.kw.length);
    const pass = r.conf >= THRESHOLD;
    let run = base;
    const penalties = r.missing.map((m) => {
      run -= MISSING_PENALTY;
      return html`
        <div class="wf-row">
          <span class="lbl">Missing <span class="mono">${m}</span></span>
          <div class="wf-track"><div class="wf-seg wf-seg--minus" style="left: ${run}%; width: ${MISSING_PENALTY}%"></div></div>
          <span class="val val--warn">−${MISSING_PENALTY}</span>
        </div>`;
    });
    return html`
      <div class="wfall">
        <div class="wf-row">
          <span class="lbl">Keyword match (${r.kw.length})</span>
          <div class="wf-track"><div class="wf-seg wf-seg--plus" style="left: 0; width: ${base}%"></div></div>
          <span class="val">+${base}</span>
        </div>
        ${penalties}
        <div class="wf-row wf-row--total">
          <span class="lbl">Confidence</span>
          <div class="wf-track"><div class="wf-seg wf-seg--total-${pass ? 'pass' : 'fail'}" style="left: 0; width: ${r.conf}%"></div></div>
          <span class="val ${pass ? 'val--pass' : 'val--warn'}">${r.conf}%</span>
        </div>
        <div class="wf-tline-wrap"><div class="wf-tline" style="left: ${THRESHOLD}%"><span>${THRESHOLD}% threshold</span></div></div>
      </div>
      <p class="meter-foot breakdown-foot">${icon('info', 'xs')} Keyword-match strength (1 kw 65 · 2 kw 80 · 3+ kw 95) − ${MISSING_PENALTY} per missing required field.</p>`;
  }

  /* ---------- Override form ---------- */

  /** Live summary under the override form; re-rendered on every edit without touching the inputs. */
  function overrideDiff(req, draft) {
    const changes = diffRoute(req.cur, draft.route);
    if (!changes.length) return html`No changes yet. If the AI suggestion is right, use <b>Approve</b> instead.`;
    return html`<b>${changes.length} change${changes.length > 1 ? 's' : ''}:</b> ${changes.map(([f, a, b], i) => html`<span>${i > 0 && ' · '}${f} <s>${a}</s> → <b>${b}</b></span>`)}${draft.note.trim().length < 10 && html`<span class="warn-text"> · add a reason to save</span>`}`;
  }

  const canSaveOverride = (req, draft) => diffRoute(req.cur, draft.route).length > 0 && draft.note.trim().length >= 10;

  function overrideForm(req, draft) {
    const { route } = draft;
    return html`
      <form class="ovr" id="ovr-form" aria-label="Correct routing for ${req.id}" novalidate>
        <div class="ovr-head">
          <span class="ovr-title">${icon('sliders')}Correct the AI's routing</span>
          <span class="ovr-hint">Changes and reason are written to the audit log.</span>
        </div>
        <div class="ovr-grid">
          <label class="field">
            <span>Category <span class="ai-was">AI: ${CATS[req.ai.cat].type}</span></span>
            <select data-ovr="cat" id="ovr-first">${CAT_KEYS.map((k) => html`<option value="${k}" ${route.cat === k && 'selected'}>${catLabel(k)}</option>`)}</select>
          </label>
          <fieldset class="field">
            <legend>Priority <span class="ai-was">AI: ${req.ai.pri}</span></legend>
            <div class="seg">
              ${PRIORITIES.map((p) => html`<label><input type="radio" name="pri-${req.id}" value="${p}" data-ovr="pri" ${route.pri === p && 'checked'}><span>${p} ${PRI_LABEL[p]}</span></label>`)}
            </div>
          </fieldset>
          <label class="field">
            <span>Target queue <span class="ai-was">AI: ${req.ai.queue}</span></span>
            <select data-ovr="queue">${QUEUES.map((q) => html`<option ${route.queue === q && 'selected'}>${q}</option>`)}</select>
          </label>
          <label class="field">
            <span>Resolver group <span class="ai-was">AI: ${req.ai.group}</span></span>
            <select data-ovr="group">${GROUPS.map((g) => html`<option ${route.group === g && 'selected'}>${g}</option>`)}</select>
          </label>
          <label class="field field--full">
            <span>Reason for override<em>Required</em></span>
            <textarea rows="2" data-ovr="note" placeholder="e.g. Requester confirmed this is a password reset on the HR portal, not a new account.">${draft.note}</textarea>
            <small>At least 10 characters.</small>
          </label>
        </div>
        <div class="ovr-diff" id="ovr-diff" aria-live="polite">${overrideDiff(req, draft)}</div>
        <div class="ovr-actions">
          <button type="button" class="btn btn-ghost" data-cmd="ovr-cancel">Cancel <span class="kbd">Esc</span></button>
          <button type="submit" class="btn btn-primary" id="ovr-save" ${!canSaveOverride(req, draft) && 'disabled'}>${icon('route', 'sm')}Save override &amp; route</button>
        </div>
      </form>`;
  }

  /* ---------- AI suggestion card ---------- */

  /** What the AI suggests for this ticket. Always worded as a suggestion: a person approves or corrects it. */
  function aiSuggestion(r) {
    const pass = r.ai.status === 'AR';
    const d = r.conf - THRESHOLD;
    const info = CAT_INFO[r.ai.cat];
    const band = confBand(r.conf);
    const fact = (ico, tone, label, value, ink = tone) => html`
      <div class="ais-fact">
        <span class="ais-fact-ico ais-tone--${tone}">${icon(ico)}</span>
        <div><span class="ais-fact-label">${label}</span><span class="ais-fact-val ${ink && `ais-ink--${ink}`}">${value}</span></div>
      </div>`;
    const priTone = { P1: 'red', P2: 'orange', P3: 'slate', P4: 'gray' }[r.ai.pri];
    const evidence = [...r.kw, ...(r.sig ? [r.sig] : [])];
    return html`
      <section class="ais ais--${pass ? 'pass' : 'fail'}" aria-label="AI suggestion">
        <header class="ais-head">
          <span class="ais-head-ico">${icon('spark', 'lg')}</span>
          <div><h4>AI Suggestion</h4><span>Received at ${r.received}</span></div>
        </header>

        <div class="ais-route">
          <span class="ais-kicker"><i class="ais-dot"></i>Routing suggestion${!pass && html`<em> · needs your review</em>`}</span>
          <div class="ais-route-row">
            <div class="ais-from"><span>From</span><b>${r.ai.queue}</b></div>
            <span class="ais-arrow" aria-hidden="true">${icon('arrowRight')}</span>
            <div class="ais-to"><span>To</span><b>${r.ai.group}</b></div>
          </div>
        </div>

        <div class="ais-body">
          <div class="ais-conf" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r.conf}" aria-label="${meterLabel(r.conf, pass)}">
            <div class="ais-conf-score">
              <span class="ais-label">Confidence</span>
              <span class="ais-conf-val">${r.conf}%<small class="ais-ink--${pass ? 'green' : 'amber'}">${band}</small></span>
            </div>
            <div class="ais-conf-bar">
              <div class="ais-conf-legend">
                <span>${THRESHOLD}% auto-route threshold</span>
                <b class="ais-ink--${pass ? 'green' : 'amber'}">${d === 0 ? 'At threshold' : d > 0 ? `+${d} points above threshold` : `${-d} points below threshold`}</b>
              </div>
              <div class="ais-track">
                <div class="ais-fill" style="width: ${r.conf}%"></div>
                <div class="ais-thresh" style="left: ${THRESHOLD}%"></div>
              </div>
            </div>
          </div>

          <div class="ais-section">
            <span class="ais-label">${icon('scanText')}Rationale</span>
            <div class="ais-cat">
              <span class="ais-cat-ico">${icon(info.icon)}</span>
              <div><b>${CATS[r.ai.cat].type}</b><p>${info.summary}</p></div>
            </div>
            <p class="ais-why">${rationaleText(r)}</p>
            <div class="ais-facts">
              ${fact('siren', priTone, 'Urgency', html`${r.ai.pri} <span class="ais-fact-sub">${PRI_LABEL[r.ai.pri]}</span>`)}
              ${fact('listChecks', r.missing.length ? 'amber' : 'green', 'Required fields', r.missing.length ? `${r.missing.length} missing` : 'All present')}
              ${fact('workflow', 'blue', 'Route policy', info.policy, '')}
            </div>
          </div>

          <div class="ais-section">
            <span class="ais-label">${icon('quote')}Evidence found</span>
            <div class="ais-evidence">
              ${evidence.length ? evidence.map((k) => html`<span class="ais-chip">${k}</span>`) : html`<span class="muted">No category keywords found in the request.</span>`}
              ${r.missing.map((m) => html`<span class="ais-chip ais-chip--missing">missing: ${m}</span>`)}
            </div>
          </div>
        </div>

      </section>`;
  }

  /* ---------- Detail panel ---------- */

  const section = (title, extra, body) => html`<section class="dsec"><h4>${title} ${extra}<span class="line"></span></h4>${body}</section>`;

  function detailPanel({ req: r, collapsed, overrideDraft }) {
    const collapseBtn = html`<button class="btn btn-ghost btn-icon" data-cmd="collapse" aria-label="Collapse ticket breakdown" aria-expanded="true" title="Collapse">${icon('chevronRight')}</button>`;

    if (collapsed) {
      return html`
        <div class="detail-rail">
          <button class="btn btn-ghost btn-icon" data-cmd="expand" aria-label="Expand ticket breakdown" aria-expanded="false" title="Expand breakdown">${icon('chevronLeft')}</button>
          ${r && html`<span class="rail-dot rail-dot--${statusClass(r.status)}" aria-hidden="true"></span><span class="rail-label">${r.id}</span>`}
        </div>`;
    }

    if (!r) {
      return html`
        <div class="detail-head detail-head--bar"><span class="detail-head-title">Ticket breakdown</span><span class="spacer"></span>${collapseBtn}</div>
        <div class="detail-empty">
          <div class="empty-ico empty-ico--neutral">${icon('panel', 'lg')}</div>
          <h4>Select a ticket</h4>
          <p>Choose a request on the left to see the AI suggestion, pipeline and confidence breakdown.</p>
        </div>`;
    }

    const c = CATS[r.ai.cat];
    const overrideOpen = !!overrideDraft;

    const human = r.human && html`
      <div class="human-box">
        <span class="who">${icon(r.human.action === 'override' ? 'userEdit' : 'userCheck', 'sm')}${decisionLabel(r.human)} by ${r.human.by} · ${r.human.at}</span>
        ${r.human.changes.length
          ? html`<div>${r.human.changes.map(([f, a, b], i) => html`<span>${i > 0 && ' · '}${f}: <s>${a}</s> → <b>${b}</b></span>`)}</div>`
          : html`<div>Accepted the AI route as recommended — no changes.</div>`}
        ${r.human.note && html`<q>${r.human.note}</q>`}
      </div>`;

    const activity = html`
      <ol class="activity">
        ${[...r.activity].reverse().map((a) => html`
          <li>
            ${a.who === 'ai' ? html`<span class="avatar-chip avatar-chip--xs avatar-chip--ai">${icon('spark', 'xs')}</span>` : avatar(a.who, 'xs')}
            <span class="activity-text"><b>${a.who === 'ai' ? 'AI' : analystName(a.who)}</b> ${a.text}</span>
            <time>${clock(a.at)}</time>
          </li>`)}
      </ol>`;

    const inferred = Object.entries(CAT_INFO[r.ai.cat].inferred);
    const fields = html`
      <div class="ftable-wrap">
        <table class="ftable">
          <thead><tr><th>Field</th><th>Value</th><th>Status</th></tr></thead>
          <tbody>
            ${c.req.map((f) => {
              const miss = r.missing.includes(f);
              return html`
                <tr class="${miss ? 'miss' : ''}">
                  <td class="fname">${f}</td>
                  <td>${miss ? html`<span class="fnone">Not provided</span>` : SYN[f]}</td>
                  <td>${miss
                    ? html`<span class="fstate fstate--miss">${icon('alert', 'sm')}Missing</span>`
                    : html`<span class="fstate fstate--ok">${icon('check', 'sm')}Present</span>`}</td>
                </tr>`;
            })}
            ${inferred.map(([f, value]) => html`
              <tr class="inferred" title="Not stated in the request. The AI infers this from context. Check it before routing.">
                <td class="fname">${f}</td>
                <td>${value()}</td>
                <td><span class="fstate fstate--inferred">${icon('spark', 'sm')}Inferred</span></td>
              </tr>`)}
          </tbody>
        </table>
      </div>`;

    return html`
      <div class="detail-head">
        <div class="detail-head-top">
          <span class="detail-badges">
            <span class="card-id">${r.id}</span>
            ${r.status !== 'AR' && statusBadge(r.status)}
            ${priorityTag(r.cur.pri)}
          </span>
          ${collapseBtn}
        </div>
        <h3>${r.title}</h3>
        <div class="detail-request">
          <p class="desc-full">${r.desc}</p>
          <div class="meta-line">
            <span>${icon('file', 'xs')} Marketplace ticket (synthetic)</span>
            <span>Approved upstream · ${r.received}</span>
            <span>${catLabel(r.cur.cat)}</span>
          </div>
        </div>
        ${workLine(r)}
      </div>

      <div class="detail-body">
        ${aiSuggestion(r)}
        ${human}
        ${overrideOpen && overrideForm(r, overrideDraft)}
        ${section('Activity', html`<span class="count-pill">${r.activity.length}</span>`, activity)}
        ${section('Extracted fields', '', fields)}
        ${section('Pipeline', '', pipeline(r))}
        ${section('Confidence breakdown', '', confidenceBreakdown(r))}
      </div>

      <div class="detail-foot">
        ${[...actionsFor(r)].reverse().map((a) => {
          const m = ACTION_META[a];
          return html`<button class="btn btn-${m.kind}" data-act="${a}" data-id="${r.id}" ${a === 'override' && html`aria-expanded="${overrideOpen}"`}>${icon(m.icon, 'sm')}${m.label}${a === 'approve' && html`<span class="kbd">A</span>`}</button>`;
        })}
      </div>`;
  }

  /* ---------- Ingest modal ---------- */

  function ingestModal({ text, running, step, preview }) {
    const dis = running && 'disabled';
    return html`
      <div class="modal-wrap" data-cmd="ingest-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ing-h">
          <div class="modal-head">
            <span class="brand-mark brand-mark--soft">${icon('mail')}</span>
            <div class="grow">
              <h3 id="ing-h">Ingest from email</h3>
              <p>Run an email through the 6-step routing pipeline.</p>
            </div>
            <button class="btn btn-ghost btn-icon" data-cmd="ingest-close" ${dis} aria-label="Close">${icon('x')}</button>
          </div>
          <div class="modal-body">
            <div class="sanitized">${icon('shield', 'sm')}Sample email: sanitized, no real data.</div>
            <div class="row">
              <span class="muted small">Load sample:</span>
              <button class="btn btn-secondary btn-sm" data-cmd="ingest-sample" data-sample="complete" ${dis}>Complete</button>
              <button class="btn btn-secondary btn-sm" data-cmd="ingest-sample" data-sample="incomplete" ${dis}>Incomplete</button>
            </div>
            <label class="field">
              <span>Email body</span>
              <textarea class="email-ta" id="ingest-text" spellcheck="false" ${dis}>${text}</textarea>
            </label>
            ${running && preview && html`<section class="dsec"><h4>Pipeline progress <span class="line"></span></h4>${pipeline(preview, step)}</section>`}
          </div>
          <div class="modal-foot">
            <span class="muted small grow">Threshold ${THRESHOLD}%</span>
            <button class="btn btn-ghost" data-cmd="ingest-close" ${dis}>Cancel</button>
            <button class="btn btn-primary" id="ingest-run" data-cmd="ingest-run" ${(running || !text.trim()) && 'disabled'}>
              ${running ? html`${icon('loader', 'sm')}Running…` : html`${icon('spark', 'sm')}Run through pipeline`}
            </button>
          </div>
        </div>
      </div>`;
  }

  /* ---------- Toast ---------- */

  function toast(t) {
    if (!t) return '';
    return html`
      <div class="toast" role="status">
        ${icon('checkCircle', 'sm')}
        <span>${t.msg}</span>
        ${t.undo && html`<button data-cmd="undo">${icon('undo', 'xs')}Undo</button>`}
        <button data-cmd="toast-dismiss" aria-label="Dismiss">${icon('x', 'xs')}</button>
      </div>`;
  }

  Object.assign(W2W, { decisionLabel, statusLabel, avatar, ACTION_META, liveText, refreshButton, shortcutsCard, accountCard, kpiBand, tabs, SORTS, sortsFor, listMeta, filterCount, filtersButton, filtersCard, card, skeletonCard, emptyState, pipeline, overrideDiff, canSaveOverride, detailPanel, ingestModal, toast });
})();
