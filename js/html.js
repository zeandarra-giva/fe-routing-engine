// Shared namespace for the app's scripts (loaded in order by index.html; no modules or build step).
window.W2W = {};

// Tiny HTML templating: values interpolated into `html` are escaped unless they are themselves `html`/`raw` output.
// Ticket titles and descriptions can come from pasted email text, so escaping is the default, not an opt-in.
(() => {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

  class Raw {
    constructor(s) { this.s = s; }
    toString() { return this.s; }
  }
  /** Marks a string as trusted markup. Only use for markup this app builds itself. */
  const raw = (s) => new Raw(s);

  const val = (v) => {
    if (v == null || v === false) return '';
    if (v instanceof Raw) return v.s;
    if (Array.isArray(v)) return v.map(val).join('');
    return esc(v);
  };

  function html(strings, ...vals) {
    let out = strings[0];
    for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1];
    return new Raw(out);
  }

  Object.assign(W2W, { esc, raw, html });
})();
