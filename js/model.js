// Data model and routing rules. Synthetic data only.
//
// Request shape:
//   { id, title, desc, kw[], missing[], sig, conf,
//     ai: { cat, pri, queue, group, status: 'AR' | 'NR' },   // what the AI suggests
//     cur: { cat, pri, queue, group },                       // current route (differs after an override)
//     status: 'AR' | 'NR' | 'OV' | 'HA', age, received,
//     human: null | { action: 'approve' | 'override', by, at, note, changes: [field, from, to][] },
//     work: 'open' | 'waiting', activity: { at, who, text }[], updatedAt, isNew? }
(() => {
  'use strict';

  const THRESHOLD = 75;

  const ME = 'aa';
  const ANALYSTS = {
    aa: { id: 'aa', name: 'A. Analyst', initials: 'AA', hue: 'indigo' },
    jr: { id: 'jr', name: 'J. Reviewer', initials: 'JR', hue: 'teal' },
    ms: { id: 'ms', name: 'M. Santos', initials: 'MS', hue: 'violet' },
    kl: { id: 'kl', name: 'K. Lee', initials: 'KL', hue: 'rose' },
    rp: { id: 'rp', name: 'R. Patel', initials: 'RP', hue: 'cyan' },
  };
  const TEAMMATES = Object.keys(ANALYSTS).filter((id) => id !== ME);
  const analystName = (id) => (id === ME ? 'You' : ANALYSTS[id].name);

  const CATS = {
    pwd: { domain: 'IT Access', type: 'Password Reset', queue: 'Helpdesk-Queue', group: 'Service Desk L1', kws: ['password', 'reset', 'locked out', 'cannot login', 'unlock'], req: ['user_id', 'system_name'] },
    acct: { domain: 'IT Access', type: 'Account Provisioning', queue: 'IAM-Queue', group: 'Identity & Access Mgmt', kws: ['account', 'provision', 'new user', 'onboarding', 'create login', 'new hire'], req: ['employee_id', 'system_name', 'manager'] },
    data: { domain: 'Data', type: 'Data Access Request', queue: 'Data-Queue', group: 'Data Governance', kws: ['database', 'table access', 'schema', 'dataset', 'read access'], req: ['dataset', 'access_level', 'justification'] },
    share: { domain: 'Data', type: 'File Share Access', queue: 'Data-Queue', group: 'Data Governance', kws: ['shared drive', 'file share', 'folder'], req: ['path', 'access_level'] },
    net: { domain: 'Infrastructure', type: 'Network Change', queue: 'Network-Queue', group: 'Network Engineering', kws: ['firewall', 'port', 'network', 'vlan'], req: ['source', 'destination', 'port'] },
    vm: { domain: 'Infrastructure', type: 'VM Provisioning', queue: 'Cloud-Queue', group: 'Cloud Platform Eng', kws: ['virtual machine', 'server', 'compute'], req: ['environment', 'size', 'cost_center'] },
  };
  const CAT_KEYS = Object.keys(CATS);

  /**
   * How the AI explains each category, in present tense: it suggests a route, a person decides.
   * `inferred` lists fields the request doesn't state but the AI fills in from context, for the analyst to check.
   */
  const nextMonday = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const CAT_INFO = {
    pwd: { icon: 'key', policy: 'Password access', summary: 'The request describes a user who cannot access their account and needs login recovery.', inferred: { account_type: () => 'Standard user (non-admin)' } },
    acct: { icon: 'userPlus', policy: 'Identity provisioning', summary: 'The request asks for a new user account and login so someone can start work.', inferred: { start_date: nextMonday } },
    data: { icon: 'database', policy: 'Data access governance', summary: 'The request asks for access to a database, schema or dataset.', inferred: {} },
    share: { icon: 'folder', policy: 'File share access', summary: 'The request asks for access to a shared drive or folder.', inferred: {} },
    net: { icon: 'network', policy: 'Network change control', summary: 'The request asks for a firewall, port or network configuration change.', inferred: {} },
    vm: { icon: 'server', policy: 'Cloud provisioning', summary: 'The request asks for a new server or compute capacity.', inferred: {} },
  };

  /** Plain-language confidence band shown next to the score. */
  const confBand = (conf) => (conf >= 85 ? 'High' : conf >= THRESHOLD ? 'Moderate' : 'Low');
  const QUEUES = [...new Set(Object.values(CATS).map((c) => c.queue)), 'Triage-Queue'];
  const GROUPS = [...new Set(Object.values(CATS).map((c) => c.group)), 'Ops Triage'];

  const SYN = {
    user_id: 'u-syn-4821', system_name: 'HRPortal-SYN', manager: 'mgr-syn-118', employee_id: 'E-SYN-0482',
    dataset: 'fin_reporting_syn', access_level: 'read-only', justification: 'Quarterly report build',
    source: '10.0.4.0/24 (syn)', destination: '10.8.2.15 (syn)', port: '443/TCP', environment: 'UAT',
    size: '4 vCPU / 16 GB', cost_center: 'CC-SYN-2210', path: '\\\\share-syn\\ops\\reports',
  };

  const PRI_LABEL = { P1: 'Critical', P2: 'High', P3: 'Medium', P4: 'Low' };
  const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];

  const PRI_RULES = [
    { re: /production down|outage|urgent/i, p: 'P1' },
    { re: /blocked|deadline today/i, p: 'P2' },
    { re: /low priority|whenever/i, p: 'P4' },
  ];

  const kwScore = (n) => (n >= 3 ? 95 : n === 2 ? 80 : n === 1 ? 65 : 20);
  const MISSING_PENALTY = 25;
  const confOf = (kw, missing) => Math.max(5, kwScore(kw.length) - MISSING_PENALTY * missing.length);

  function prioritize(text) {
    for (const r of PRI_RULES) {
      const m = text.match(r.re);
      if (m) return { p: r.p, sig: m[0].toLowerCase() };
    }
    return { p: 'P3', sig: null };
  }

  /** 12-hour time with AM/PM, e.g. "1:05 PM". */
  const clock = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  /** Same, with seconds, e.g. "3:59:10 PM". */
  const clockSec = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const MIN = 60_000;

  function make(o) {
    const c = CATS[o.cat];
    const route = { cat: o.cat, pri: o.pri, queue: c.queue, group: c.group };
    const conf = confOf(o.kw, o.missing);
    const status = conf >= THRESHOLD && !o.missing.length ? 'AR' : 'NR';
    const age = o.age ?? 0;
    const receivedAt = Date.now() - age * MIN;
    return {
      id: o.id, title: o.title, desc: o.desc, kw: o.kw, missing: o.missing, sig: o.sig ?? null, conf,
      ai: { ...route, status }, cur: { ...route }, status, age, received: clock(receivedAt), human: null,
      work: 'open', updatedAt: receivedAt,
      activity: [{ at: receivedAt, who: 'ai', text: status === 'AR' ? `suggests routing to ${c.queue} (${conf}%)` : `flags this for review (${conf}%)` }],
    };
  }

  /** Applies a work-state change and appends to the activity log, returning a new object. */
  function withWork(r, work, who, text, at = Date.now()) {
    return { ...r, work, updatedAt: at, activity: [...r.activity, { at, who, text }] };
  }

  /** An analyst accepts the AI's route unchanged. Clears any wait on the requester. */
  function approveRoute(r, who, by, at = Date.now()) {
    return { ...withWork(r, 'open', who, `Approved AI route → ${r.cur.queue}`, at), status: 'HA', human: { action: 'approve', by, at: clock(at), note: '', changes: [] } };
  }

  /** An analyst changes the AI's route; `changes` lists what moved. */
  function overrideRoute(r, who, by, route, note, changes, at = Date.now()) {
    return {
      ...withWork(r, 'open', who, `Overrode AI: ${changes.map(([f, , b]) => `${f} → ${b}`).join(', ')}`, at),
      cur: route, status: 'OV', human: { action: 'override', by, at: clock(at), note, changes },
    };
  }

  const catLabel = (k) => `${CATS[k].domain} › ${CATS[k].type}`;

  /**
   * Which tab a ticket lives in. Once an analyst approves or overrides it, it moves to Resolved whichever queue it
   * came from; until then the AI's confidence decides Ready to route vs Needs review.
   */
  const queueOf = (r) => (r.human ? 'resolved' : r.ai.status === 'NR' ? 'review' : 'ready');

  function buildData() {
    const hand = [
      { id: 'REQ-2000', title: 'New hire needs account', desc: 'Please provision a new user account and create login for onboarding.', cat: 'acct', pri: 'P3', kw: ['account', 'provision', 'new user', 'onboarding', 'create login'], missing: ['employee_id'] },
      { id: 'REQ-2001', title: 'Locked out of account', desc: 'Please help with my request, see attached.', cat: 'acct', pri: 'P3', kw: ['account'], missing: ['system_name'] },
      { id: 'REQ-2002', title: 'Need database table access', desc: 'Requesting read access to a database schema and report. Low priority, whenever.', cat: 'data', pri: 'P4', sig: 'low priority', kw: ['database', 'table access', 'schema'], missing: ['dataset'] },
      { id: 'REQ-2003', title: 'New hire needs account', desc: 'Please provision a new user account and create login for onboarding. This is urgent, production down.', cat: 'acct', pri: 'P1', sig: 'production down', kw: ['account', 'provision', 'new user', 'onboarding', 'create login'], missing: ['employee_id'] },
      { id: 'REQ-2004', title: 'Locked out of account', desc: 'User is locked out and cannot login, needs a password reset urgently.', cat: 'pwd', pri: 'P1', sig: 'urgent', kw: ['password', 'reset', 'locked out', 'cannot login'], missing: [] },
      { id: 'REQ-2005', title: 'Need database table access', desc: 'Need table access on the reporting database, see attached. Low priority, whenever.', cat: 'data', pri: 'P4', sig: 'low priority', kw: ['database', 'table access'], missing: [] },
      { id: 'REQ-2006', title: 'Locked out of account', desc: 'User is locked out and cannot login, needs a password reset urgently. Blocked, deadline today.', cat: 'pwd', pri: 'P1', sig: 'urgent', kw: ['password', 'reset', 'locked out', 'cannot login'], missing: [] },
      { id: 'REQ-2007', title: 'New hire needs account', desc: 'Please provision a new user account and create login for onboarding. This is urgent, production down.', cat: 'acct', pri: 'P1', sig: 'production down', kw: ['account', 'provision', 'new user', 'onboarding', 'create login'], missing: [] },
      { id: 'REQ-2008', title: 'Open firewall port', desc: 'Requesting a firewall port change / network vlan update. This is urgent, production down.', cat: 'net', pri: 'P1', sig: 'production down', kw: ['firewall', 'port', 'network', 'vlan'], missing: [] },
      { id: 'REQ-2009', title: 'Locked out of account', desc: 'User is locked out and cannot login, needs a password reset.', cat: 'pwd', pri: 'P3', kw: ['password', 'reset', 'locked out', 'cannot login'], missing: [] },
      { id: 'REQ-2010', title: 'New hire needs account', desc: 'Please provision a new user account and create login for onboarding.', cat: 'acct', pri: 'P3', kw: ['account', 'provision', 'new user', 'onboarding', 'create login'], missing: ['employee_id'] },
      { id: 'REQ-2011', title: 'Provision new server', desc: 'Need a new virtual machine / compute host provisioned in the environment. Blocked, deadline today.', cat: 'vm', pri: 'P2', sig: 'blocked', kw: ['virtual machine', 'server', 'compute'], missing: [] },
      { id: 'REQ-2012', title: 'New hire needs account', desc: 'Please provision a new user account and create login for onboarding.', cat: 'acct', pri: 'P3', kw: ['account', 'provision', 'new user', 'onboarding', 'create login'], missing: [] },
      { id: 'REQ-2013', title: 'Open firewall port', desc: 'Requesting a firewall port change / network vlan update. Blocked, deadline today.', cat: 'net', pri: 'P2', sig: 'blocked', kw: ['firewall', 'port', 'network', 'vlan'], missing: ['source'] },
      { id: 'REQ-2014', title: 'Access to team shared drive', desc: 'Need write access to the team shared drive folder for month-end files. Blocked, deadline today.', cat: 'share', pri: 'P2', sig: 'blocked', kw: ['shared drive', 'folder'], missing: ['path'] },
    ];

    // Deterministic filler → totals 44 auto-routed / 15 needs review / 1 overridden
    let seed = 7;
    const rnd = () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const templates = [
      { cat: 'pwd', title: 'Locked out of account', base: 'User is locked out and cannot login, needs a password reset.', kw: ['password', 'reset', 'locked out', 'cannot login'] },
      { cat: 'pwd', title: 'Password reset request', base: 'Password expired, please reset so I can login again.', kw: ['password', 'reset'] },
      { cat: 'acct', title: 'New hire needs account', base: 'Please provision a new user account and create login for onboarding.', kw: ['account', 'provision', 'new user', 'onboarding', 'create login'] },
      { cat: 'data', title: 'Need database table access', base: 'Requesting read access to a database schema and report.', kw: ['database', 'table access', 'schema'] },
      { cat: 'net', title: 'Open firewall port', base: 'Requesting a firewall port change / network vlan update.', kw: ['firewall', 'port', 'network', 'vlan'] },
      { cat: 'vm', title: 'Provision new server', base: 'Need a new virtual machine / compute host provisioned in the environment.', kw: ['virtual machine', 'server', 'compute'] },
    ];
    const suffixes = [
      [' This is urgent, production down.', 'P1', 'production down'],
      [' Blocked, deadline today.', 'P2', 'blocked'],
      ['', 'P3', null],
      ['', 'P3', null],
      [' Low priority, whenever.', 'P4', 'low priority'],
    ];
    const gen = [];
    for (let i = 0; i < 45; i++) {
      const t = templates[Math.floor(rnd() * templates.length)];
      const [suf, pri, sig] = suffixes[Math.floor(rnd() * suffixes.length)];
      const isNR = i % 5 === 2;
      let kw = t.kw.slice();
      let missing = [];
      if (isNR) {
        if (i % 2) kw = kw.slice(0, 1);
        else missing = [CATS[t.cat].req[0]];
      }
      gen.push({ id: `REQ-${2015 + i}`, title: t.title, desc: t.base + suf, cat: t.cat, pri, sig, kw, missing });
    }

    const all = [...hand, ...gen].map((o, i, arr) => make({ ...o, age: (arr.length - i) * 3 + 2 }));

    const r0 = all[0];
    const t0 = Date.now() - 150 * MIN;
    r0.cur.pri = 'P2';
    r0.status = 'OV';
    r0.human = {
      action: 'override', by: 'J. Reviewer', at: clock(t0),
      note: 'Start date is today per hiring manager; employee_id E-SYN-0390 supplied by HR offline. Raised to P2.',
      changes: [['Priority', 'P3', 'P2']],
    };

    // Besides REQ-2000's override, a few tickets already have an approved route or are waiting on the requester.
    const plan = { 'REQ-2008': ['approved', 'rp'], 'REQ-2010': ['waiting', 'aa'] };
    const others = ['jr', 'ms', 'kl', 'rp'];
    return all.map((r, i) => {
      let step = plan[r.id];
      if (!step && i >= 15) {
        const g = i - 15;
        if (g % 7 === 0 && r.status !== 'NR') step = ['approved', others[g % 4]];
        else if (g % 9 === 4 && r.missing.length) step = ['waiting', others[(g + 2) % 4]];
      }
      if (!step) return r;
      const [kind, who] = step;
      const at = Math.min(Date.now() - 2 * MIN, r.activity[0].at + (8 + (i % 5) * 6) * MIN);
      if (kind === 'waiting') return withWork(r, 'waiting', who, `Requested ${r.missing.join(', ')} from requester`, at);
      return approveRoute(r, who, ANALYSTS[who].name, at);
    });
  }

  /**
   * Actions available on a ticket, most important first. A ticket is resolved by exactly one human decision:
   * approve the AI route unchanged, or override it. A decided ticket can still be overridden to correct it.
   */
  function actionsFor(r) {
    if (r.human) return ['override'];
    const info = r.missing.length ? [r.work === 'waiting' ? 'infoReceived' : 'requestInfo'] : [];
    return ['approve', 'override', ...info];
  }

  function analyze(text, id) {
    const low = text.toLowerCase();
    let best = null;
    for (const k of CAT_KEYS) {
      const kw = CATS[k].kws.filter((w) => low.includes(w));
      if (!best || kw.length > best.kw.length) best = { k, kw };
    }
    const c = CATS[best.k];
    const missing = c.req.filter((f) => !new RegExp(f.replace('_', '[ _]?') + '\\s*:\\s*\\S+', 'i').test(text));
    const { p, sig } = prioritize(text);
    const subj = (text.match(/subject:\s*(.+)/i) || [])[1]?.trim() || 'Ingested email request';
    const body = text.split(/\n\s*\n/)[1]?.replace(/\s+/g, ' ').trim() || subj;
    return make({ id, title: subj, desc: body, cat: best.k, pri: p, sig, kw: best.kw, missing, age: 0 });
  }

  function diffRoute(from, to) {
    const out = [];
    if (to.cat !== from.cat) out.push(['Category', CATS[from.cat].type, CATS[to.cat].type]);
    if (to.pri !== from.pri) out.push(['Priority', from.pri, to.pri]);
    if (to.queue !== from.queue) out.push(['Queue', from.queue, to.queue]);
    if (to.group !== from.group) out.push(['Resolver', from.group, to.group]);
    return out;
  }

  function pipelineSteps(r) {
    const c = CATS[r.ai.cat];
    const n = r.kw.length;
    return [
      { title: 'Categorize', ok: n >= 2, result: `${c.domain} › ${c.type}` },
      { title: 'Prioritize', ok: true, result: `${r.ai.pri} ${PRI_LABEL[r.ai.pri]}` },
      { title: 'Validate completeness', ok: !r.missing.length, result: `${c.req.length - r.missing.length}/${c.req.length} fields` },
      { title: 'Determine target queue', ok: true, result: r.ai.queue },
      { title: 'Recommend resolver group', ok: true, result: r.ai.group },
      { title: 'Score & suggest', ok: r.ai.status === 'AR', result: r.ai.status === 'AR' ? 'Suggests auto-route' : 'Suggests review' },
    ];
  }

  const SAMPLE_EMAILS = {
    complete: `From: requester@example.com
  Subject: Locked out after password expiry

  Hi team, I'm locked out and cannot login to the expense portal
  after my password expired. Blocked, deadline today for my
  submissions.

  user_id: u-syn-7731
  system_name: ExpensePortal-SYN`,
    incomplete: `From: requester@example.com
  Subject: Firewall change for new reporting job

  Hello, we need a firewall port opened for the nightly job.
  Destination is the reporting cluster.

  port: 8443/TCP`,
  };

  Object.assign(W2W, { THRESHOLD, ME, ANALYSTS, TEAMMATES, analystName, CATS, CAT_KEYS, CAT_INFO, confBand, QUEUES, GROUPS, SYN, PRI_LABEL, PRIORITIES, kwScore, MISSING_PENALTY, prioritize, clock, clockSec, withWork, approveRoute, overrideRoute, catLabel, queueOf, buildData, actionsFor, analyze, diffRoute, pipelineSteps, SAMPLE_EMAILS });
})();
