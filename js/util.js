/* ============================================================
   Prompt Organizer — util.js
   Dependency-free helpers: text, similarity, diff, tokens, CRC, ZIP bits.
   ============================================================ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slug(s, maxLen) {
    var t = String(s || 'item').toLowerCase().replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maxLen || 40);
    return t || 'item';
  }
  function uid(prefix) {
    return (prefix || 'id') + '.' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }
  function nowISO() { return new Date().toISOString(); }
  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return String(iso); }
  }
  function fmtAgo(iso) {
    if (!iso) return '—';
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
    };
  }
  function deepClone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* ---------- text stats ---------- */
  function wordsOf(t) { t = String(t || '').trim(); return t ? t.split(/\s+/).length : 0; }
  function charsOf(t) { return String(t || '').length; }
  function tokenEstimate(t) {
    // Heuristic ≈ GPT-style BPE: ~4 chars/token blended with word count.
    var s = String(t || '');
    if (!s) return 0;
    return Math.max(1, Math.round(s.length / 4 * 0.7 + wordsOf(s) * 0.75 * 0.3 + wordsOf(s) * 0.55));
  }
  function readingTimeMin(t) { var w = wordsOf(t); return w ? Math.max(1, Math.round(w / 200)) : 0; }

  /* ---------- normalization / similarity ---------- */
  var STOP = {};
  ('a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,being,' +
   'it,its,this,that,these,those,they,them,their,there,here,you,your,we,our,he,she,not,no,do,does,did,will,' +
   'would,can,could,should,shall,must,may,might,have,has,had,also,very,more,most,such,into,over,under,than,' +
   'when,where,which,what,how,why,all,any,each,every,some,other,between,through,during,before,after,about,' +
   'up,out,off,again,once,just,only,own,same,so,because,until,while,both,few,many,i,me,my,myself').split(',')
    .forEach(function (w) { STOP[w] = 1; });

  function normalize(t) {
    return String(t || '').toLowerCase().replace(/[`*_#>\[\](){}|~]/g, ' ')
      .replace(/[^a-z0-9\s'\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function tokenize(t, keepStop) {
    return normalize(t).split(' ').filter(function (w) { return w && (keepStop || !STOP[w]); });
  }
  function shingles(t, k) {
    var toks = tokenize(t), n = k || 3, out = {};
    for (var i = 0; i + n <= toks.length; i++) out[toks.slice(i, i + n).join(' ')] = 1;
    if (!toks.length) return out;
    if (toks.length < n) out[toks.join(' ')] = 1;
    return out;
  }
  function jaccard(a, b) {
    var ka = Object.keys(a), sb = {}, inter = 0;
    Object.keys(b).forEach(function (k) { sb[k] = 1; });
    ka.forEach(function (k) { if (sb[k]) inter++; });
    var uni = ka.length + Object.keys(b).length - inter;
    return uni ? inter / uni : 0;
  }
  function similarity(a, b) {
    // Blend of shingle Jaccard + token overlap; 0..1
    if (!a || !b) return 0;
    var na = normalize(a), nb = normalize(b);
    if (na === nb) return 1;
    var j = jaccard(shingles(na), shingles(nb));
    var ta = {}, tb = {}, ia = 0;
    tokenize(na).forEach(function (w) { ta[w] = 1; });
    var toksB = tokenize(nb);
    toksB.forEach(function (w) { tb[w] = 1; });
    Object.keys(ta).forEach(function (w) { if (tb[w]) ia++; });
    var denom = Math.min(Object.keys(ta).length, Object.keys(tb).length) || 1;
    var overlap = ia / denom;
    return clamp(j * 0.55 + overlap * 0.45, 0, 1);
  }

  /* ---------- line diff (simple LCS) ---------- */
  function lineDiff(aLines, bLines) {
    var a = aLines, b = bLines, n = a.length, m = b.length;
    if (n > 800 || m > 800) { // fall back to block compare for giant texts
      return [{ t: 'chg', a: a.join('\n').slice(0, 4000), b: b.join('\n').slice(0, 4000), note: 'large diff truncated' }];
    }
    var dp = [];
    for (var i = 0; i <= n; i++) { dp[i] = []; for (var j = 0; j <= m; j++) dp[i][j] = 0; }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--)
      dp[i][j] = (a[i] === b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    var ops = [];
    i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { ops.push({ t: 'ctx', s: a[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'del', s: a[i] }); i++; }
      else { ops.push({ t: 'add', s: b[j] }); j++; }
    }
    while (i < n) ops.push({ t: 'del', s: a[i++] });
    while (j < m) ops.push({ t: 'add', s: b[j++] });
    return ops;
  }
  function diffHTML(ops, ctxLines) {
    var ctx = (ctxLines == null ? 3 : ctxLines), out = [], pending = 0, i;
    function flushPending() {
      if (pending > ctx * 2 + 1) {
        out.push('<div class="diff-line diff-ctx">⋮ ' + (pending - ctx * 2) + ' unchanged lines</div>');
      } else {
        for (var k = 0; k < pending; k++) out._p.push(1);
      }
      pending = 0;
    }
    // simpler: show everything but collapse long ctx runs
    var html = [], run = [];
    function flushRun() {
      if (!run.length) return;
      if (run.length > ctx * 2 + 2) {
        for (i = 0; i < ctx; i++) html.push('<div class="diff-line diff-ctx">  ' + esc(run[i]) + '</div>');
        html.push('<div class="diff-line diff-ctx">⋮ ' + (run.length - ctx * 2) + ' unchanged lines</div>');
        for (i = run.length - ctx; i < run.length; i++) html.push('<div class="diff-line diff-ctx">  ' + esc(run[i]) + '</div>');
      } else run.forEach(function (s) { html.push('<div class="diff-line diff-ctx">  ' + esc(s) + '</div>'); });
      run = [];
    }
    ops.forEach(function (o) {
      if (o.t === 'ctx') { run.push(o.s); return; }
      flushRun();
      if (o.t === 'add') html.push('<div class="diff-line diff-add">+ ' + esc(o.s) + '</div>');
      else if (o.t === 'del') html.push('<div class="diff-line diff-del">− ' + esc(o.s) + '</div>');
      else html.push('<div class="diff-line diff-chg">± ' + esc(o.a || '') + ' → ' + esc(o.b || '') + '</div>');
    });
    flushRun();
    return html.join('');
  }
  function diffSummary(ops) {
    var add = 0, del = 0;
    ops.forEach(function (o) { if (o.t === 'add') add++; if (o.t === 'del') del++; });
    return { add: add, del: del, changed: add + del };
  }

  /* ---------- CRC32 (for ZIP writer) ---------- */
  var CRC_TABLE = (function () {
    var t = [], c;
    for (var n = 0; n < 256; n++) {
      c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function strToBytes(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var u = unescape(encodeURIComponent(s)), b = new Uint8Array(u.length);
    for (var i = 0; i < u.length; i++) b[i] = u.charCodeAt(i);
    return b;
  }

  /* ---------- downloads ---------- */
  function download(filename, content, mime) {
    var blob = (content instanceof Blob) ? content : new Blob([content], { type: mime || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  function copyText(s, okMsg) {
    function done() { if (window.PO && PO.ui) PO.ui.toast(okMsg || 'Copied to clipboard', 'ok'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, function () { fallback(); });
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = s; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { if (PO.ui) PO.ui.toast('Copy failed', 'bad'); }
      ta.remove();
    }
  }
  function highlight(text, q) {
    if (!q) return esc(text);
    var idx = normalize(text).indexOf(normalize(q));
    if (idx < 0) return esc(text);
    // approximate highlight on raw text
    var words = tokenize(q).filter(function (w) { return w.length > 2; }).slice(0, 6);
    var out = esc(text);
    words.forEach(function (w) {
      try { out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); }
      catch (e) { /* noop */ }
    });
    return out;
  }

  window.PO = window.PO || {};
  PO.util = {
    $: function (id) { return document.getElementById(id); },
    esc: esc, slug: slug, uid: uid, nowISO: nowISO, fmtDate: fmtDate, fmtAgo: fmtAgo,
    fmtNum: fmtNum, clamp: clamp, debounce: debounce, deepClone: deepClone,
    wordsOf: wordsOf, charsOf: charsOf, tokenEstimate: tokenEstimate, readingTimeMin: readingTimeMin,
    normalize: normalize, tokenize: tokenize, similarity: similarity, jaccard: jaccard,
    lineDiff: lineDiff, diffHTML: diffHTML, diffSummary: diffSummary,
    crc32: crc32, strToBytes: strToBytes, download: download, copyText: copyText, highlight: highlight
  };
})();
