/* ============================================================
   Prompt Organizer — ui-core.js
   Tab viewer (main + side tabs, pins, deep links, keyboard),
   selection sync, shared tree / node / modal / toast components.
   Tab bodies live in ui-tabs-a.js / ui-tabs-b.js (PO.uiTabs).
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  PO.uiTabs = {};

  var MAIN_TABS = [
    { id: 'prompts', label: 'Prompts', icon: '📝', key: 'Ctrl+1' },
    { id: 'review', label: 'Review Queue', icon: '🛎', key: 'Ctrl+2', count: true },
    { id: 'dashboard', label: 'Dashboard', icon: '📊', key: 'Ctrl+3' },
    { id: 'search', label: 'Search', icon: '🔎', key: 'Ctrl+4' },
    { id: 'versions', label: 'Versions', icon: '🕘', key: 'Ctrl+5' },
    { id: 'trace', label: 'Traceability', icon: '🔗', key: 'Ctrl+6' },
    { id: 'recompile', label: 'Recompile', icon: '🧩', key: 'Ctrl+7' }
  ];
  var SIDE_TABS = [
    { id: 'tree', label: 'Tree', icon: '🌳', key: 'Alt+1' },
    { id: 'graph', label: 'Graph', icon: '🕸', key: 'Alt+2' },
    { id: 'node', label: 'Node', icon: '📄', key: 'Alt+3' },
    { id: 'source', label: 'Source', icon: '⌖', key: 'Alt+4' },
    { id: 'readmes', label: 'READMEs', icon: '📚', key: 'Alt+5' },
    { id: 'scripts', label: 'Scripts', icon: '💻', key: 'Alt+6' },
    { id: 'documents', label: 'Documents', icon: '📑', key: 'Alt+7' },
    { id: 'assets', label: 'Assets', icon: '🖼', key: 'Alt+8' }
  ];
  var TYPE_ICONS = {
    topic: '📁', feature: '✨', mechanic: '⚙️', rule: '📏', idea: '💡',
    script: '💻', asset: '🖼', document: '📑', prompt: '📝', test: '🧪',
    requirement: '📌', folder: '🗂'
  };

  var state = {
    tab: 'dashboard',
    nodeId: null,
    filters: { q: '', type: 'any', status: 'any', tag: '', confMin: 0 },
    pinned: [],
    collapsed: {},
    sub: { prompts: 'list', versions: 'history', trace: 'links', search: 'search', scripts: 'list', documents: 'list' },
    reviewFilter: '',
    graphFilter: { hideFolders: false, type: 'any', status: 'any', tag: '', rel: 'any', focus: true },
    recomp: { root: null, withDeps: true, budget: 8000, withAnchors: false, result: null },
    compare: { a: null, b: null, filter: 'changed' },
    testRun: { promptId: null, version: null, model: 'mock-model', actuals: {}, manuals: {}, lastRun: null },
    lintCtx: 128000,
    scroll: {},
    expandSrc: {}
  };

  function W() { return PO.store.W(); }
  function $(id) { return document.getElementById(id); }

  /* ================= boot ================= */
  function boot() {
    if (window.PO_SNAPSHOT_MODE) {
      PO.store.S.snapshotMode = true;
      if (!PO.store.S.workspace) { // app.js normally parses this first; fallback only
        var dataEl = $('snapshot-data');
        if (dataEl) {
          try {
            var raw = dataEl.textContent.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
            var obj = JSON.parse(raw);
            PO.store.S.workspace = PO.store.normalizeImported(obj.workspace || obj);
          } catch (e) { console.error('snapshot parse failed', e); }
        }
      }
      $('snapshotBadge').hidden = false;
    }
    // restore saved tab selection
    try {
      var w = W();
      if (w && w.tabs) {
        if (w.tabs.main) state.tab = w.tabs.main;
        if (w.tabs.side && isSide(w.tabs.side)) state.sideSel = w.tabs.side;
        if (Array.isArray(w.tabs.pinned)) state.pinned = w.tabs.pinned.slice(0, 4);
      }
    } catch (e) { /* ignore */ }

    wireTopbar();
    wireKeyboard();
    window.addEventListener('hashchange', routeFromHash);
    routeFromHash();
    render();
  }

  function isMain(t) { return MAIN_TABS.some(function (x) { return x.id === t; }); }
  function isSide(t) { return SIDE_TABS.some(function (x) { return x.id === t; }); }

  function wireTopbar() {
    $('btnSaveJSON').onclick = function () { PO.snapshot.downloadJSON(); };
    $('btnSaveZIP').onclick = function () { PO.snapshot.downloadZIP(); };
    $('btnSnapshot').onclick = function () { PO.snapshot.downloadSnapshot(); };
    $('btnNewPrompt').onclick = function () { openNewPromptModal(); };
    $('btnHelp').onclick = function () { openHelpModal(); };
    $('btnUpload').onclick = function () { $('fileInput').click(); };
    $('fileInput').addEventListener('change', function (ev) {
      var f = ev.target.files[0];
      ev.target.value = '';
      if (f) handleUpload(f);
    });
    $('btnCopyLink').onclick = function () { U.copyText(location.href, 'Deep link copied'); };
    $('btnClosePins').onclick = function () { state.pinned = []; persistTabs(); render(); };
    var nm = $('wsName');
    nm.value = W() ? W().name : 'Untitled Workspace';
    nm.addEventListener('change', function () {
      W().name = nm.value || 'Untitled Workspace';
      PO.store.log('rename', 'Workspace renamed to “' + W().name + '”.', null);
      PO.store.touch(); PO.readme.regenerateFolder(W(), 'folder.root', 'rename'); render();
    });
  }

  function handleUpload(file) {
    PO.snapshot.readUpload(file).then(function (r) {
      var incoming;
      try { incoming = PO.store.normalizeImported(r.workspace.workspace || r.workspace); }
      catch (e) { toast('Upload failed: ' + e.message, 'bad'); return; }
      var cur = W();
      openModal(
        '<h2>Upload “' + U.esc(r.name) + '”</h2>',
        '<p>Found workspace <strong>' + U.esc(incoming.name || '?') + '</strong> — ' +
        Object.keys(incoming.nodes || {}).length + ' nodes, ' + (incoming.prompts || []).length + ' prompt(s).</p>' +
        '<div class="row"><label><input type="radio" name="umode" value="merge" checked> <strong>Merge</strong> with current work (newer wins on conflict)</label></div>' +
        '<div class="row"><label><input type="radio" name="umode" value="replace"> <strong>Replace</strong> current workspace</label></div>',
        [{ label: 'Cancel' }, {
          label: 'Upload', primary: true, onClick: function () {
            var mode = (document.querySelector('input[name=umode]:checked') || {}).value || 'merge';
            var ws = mode === 'replace'
              ? incoming
              : PO.snapshot.mergeWorkspaces(cur, incoming, 'merge');
            PO.store.setWorkspace(ws);
            PO.readme.regenerateAll(W());
            PO.store.persist();
            if (ws.tabs && ws.tabs.main) state.tab = ws.tabs.main;
            closeModal();
            render();
            toast('Uploaded (' + mode + 'd) — tabs and selection restored.', 'ok');
          }
        }]
      );
    }).catch(function (e) { toast('Upload failed: ' + (e.message || e), 'bad'); });
  }

  /* ================= routing ================= */
  // #/tab/nodeId  (nodeId optional, uri-encoded)
  function routeFromHash() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return;
    var parts = h.split('/');
    var tab = decodeURIComponent(parts[0] || '');
    var nid = parts[1] ? decodeURIComponent(parts.slice(1).join('/')) : null;
    if (isMain(tab) || isSide(tab)) state.tab = tab;
    if (nid && W() && W().nodes[nid]) state.nodeId = nid;
    render();
  }
  function pushRoute() {
    var h = '#/' + state.tab + (state.nodeId ? '/' + encodeURIComponent(state.nodeId) : '');
    if (location.hash !== h) {
      try { history.replaceState(null, '', h); }
      catch (e) { try { location.hash = h; } catch (e2) { /* non-browser context */ } }
      var r = $('statRoute');
      if (r) r.textContent = h;
    }
  }
  function persistTabs() {
    var w = W();
    if (!w) return;
    w.tabs = { main: isMain(state.tab) ? state.tab : (w.tabs && w.tabs.main) || 'dashboard', side: isSide(state.tab) ? state.tab : (w.tabs && w.tabs.side) || 'tree', pinned: state.pinned.slice() };
    PO.store.touch();
  }

  /* ================= keyboard ================= */
  function wireKeyboard() {
    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || ev.target.isContentEditable;
      if (ev.key === 'Escape') { closeModal(); return; }
      if (ev.ctrlKey || ev.metaKey) {
        var n = parseInt(ev.key, 10);
        if (n >= 1 && n <= 7) { ev.preventDefault(); setTab(MAIN_TABS[n - 1].id); }
        return;
      }
      if (ev.altKey) {
        var m = parseInt(ev.key, 10);
        if (m >= 1 && m <= 8) { ev.preventDefault(); setTab(SIDE_TABS[m - 1].id); }
        return;
      }
      if (typing) return;
      if (ev.key === '?') openHelpModal();
      else if (ev.key === 'n' || ev.key === 'N') openNewPromptModal();
      else if (ev.key === '/') { ev.preventDefault(); setTab('search'); setTimeout(function () { var q = $('gSearch'); if (q) q.focus(); }, 60); }
      else if (ev.key === '[') stepSelection(-1);
      else if (ev.key === ']') stepSelection(1);
    });
  }
  function flatTreeOrder() {
    var out = [];
    (function walk(id) {
      var n = W().nodes[id];
      if (!n) return;
      out.push(id);
      PO.analyze.childrenOf(W(), id).forEach(function (c) { walk(c.id); });
    })('folder.root');
    return out;
  }
  function stepSelection(d) {
    var order = flatTreeOrder();
    var i = order.indexOf(state.nodeId);
    i = i < 0 ? 0 : U.clamp(i + d, 0, order.length - 1);
    select(order[i], 'keyboard');
  }

  /* ================= render shell ================= */
  function setTab(tab) {
    if (!isMain(tab) && !isSide(tab)) return;
    // remember scroll
    state.scroll[state.tab] = $('content').scrollTop;
    state.tab = tab;
    persistTabs();
    render();
  }
  function select(id, from) {
    if (!W().nodes[id]) return;
    state.nodeId = id;
    PO.store.pushHistory(id);
    pushRoute();
    persistTabs();
    render();
  }
  function render() {
    var w = W();
    if (!w) return;
    renderTabBars(w);
    var host = $('tabContent');
    host.innerHTML = '';
    var fn = PO.uiTabs[state.tab];
    if (fn) {
      try { fn(w, host, api); }
      catch (e) {
        console.error(e);
        host.innerHTML = '<div class="card"><h2>Render error</h2><pre>' + U.esc(e.stack || e.message) + '</pre></div>';
      }
    } else host.innerHTML = '<div class="empty">Unknown tab.</div>';
    renderPins(w);
    updateStatus(w);
    pushRoute();
    if (state.scroll[state.tab] && !$('content').dataset.noscroll) $('content').scrollTop = state.scroll[state.tab] || 0;
  }
  function renderTabBars(w) {
    var reviewCount = PO.analyze.reviewQueue(w).length;
    var ms = $('mainStrip');
    ms.innerHTML = MAIN_TABS.map(function (t) {
      var c = t.count ? '<span class="count' + (reviewCount ? ' alert' : '') + '">' + reviewCount + '</span>' : '';
      return '<button class="tab" role="tab" data-tab="' + t.id + '" aria-selected="' + (state.tab === t.id) + '" title="' + U.esc(t.label + ' (' + t.key + ')') + '">' +
        '<span>' + t.icon + '</span><span class="tab-label">' + U.esc(t.label) + '</span>' + c + '</button>';
    }).join('');
    var ss = $('sideStrip');
    ss.innerHTML = SIDE_TABS.map(function (t) {
      return '<button class="tab" role="tab" data-tab="' + t.id + '" aria-selected="' + (state.tab === t.id) + '" title="' + U.esc(t.label + ' (' + t.key + ')') + '">' +
        '<span class="side-ico">' + t.icon + '</span><span class="tab-label">' + U.esc(t.label) + '</span></button>';
    }).join('');
    ms.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
    ss.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
  }
  function renderPins(w) {
    var panel = $('pinPanel'), host = $('pinContent');
    if (!state.pinned.length) { panel.hidden = true; host.innerHTML = ''; return; }
    panel.hidden = false;
    host.innerHTML = '';
    state.pinned.forEach(function (tab) {
      var fn = PO.uiTabs[tab];
      if (!fn || !isSide(tab)) return;
      var wrap = document.createElement('div');
      wrap.className = 'card';
      var head = document.createElement('div');
      head.className = 'row';
      head.innerHTML = '<strong style="flex:1">' + U.esc(tabLabel(tab)) + '</strong>';
      var x = document.createElement('button');
      x.className = 'btn icon sm'; x.textContent = '×'; x.title = 'Unpin';
      x.onclick = function () { state.pinned = state.pinned.filter(function (t) { return t !== tab; }); persistTabs(); render(); };
      head.appendChild(x);
      wrap.appendChild(head);
      var body = document.createElement('div');
      wrap.appendChild(body);
      host.appendChild(wrap);
      try { fn(w, body, api, { pinned: true }); } catch (e) { body.innerHTML = '<pre>' + U.esc(e.message) + '</pre>'; }
    });
  }
  function tabLabel(id) {
    var all = MAIN_TABS.concat(SIDE_TABS);
    var t = all.filter(function (x) { return x.id === id; })[0];
    return t ? t.label : id;
  }
  function updateStatus(w) {
    var A = PO.analyze, st = A.stats(w), h = A.health(w);
    $('statNodes').textContent = st.nodes + ' nodes';
    $('statLinks').textContent = st.edges + ' links';
    var he = $('statHealth');
    he.textContent = 'health ' + h.score + '/100';
    he.className = h.score >= 75 ? 'ok-t' : (h.score >= 50 ? 'warn-t' : 'bad-t');
    var sel = state.nodeId && w.nodes[state.nodeId];
    $('statSel').textContent = sel ? ('◉ ' + sel.id) : 'nothing selected';
    $('statSel').title = sel ? sel.title : 'Selected node';
  }

  /* ================= shared components ================= */
  function typeIcon(t) { return TYPE_ICONS[t] || '•'; }
  function statusPill(n) {
    return '<span class="pill st-' + n.status + '">' + n.status + '</span>' +
      ((n.stale && n.stale.flag) ? '<span class="pill stale">stale</span>' : '') +
      ((n.conf || 0) < 0.5 ? '<span class="pill conf-low">conf ' + Math.round((n.conf || 0) * 100) + '%</span>' : '');
  }
  function nodePills(n) {
    return '<span class="pill type">' + typeIcon(n.type) + ' ' + n.type + '</span>' + statusPill(n) +
      (n.tags || []).slice(0, 6).map(function (t) { return '<span class="pill tag">#' + U.esc(t) + '</span>'; }).join('');
  }
  function crumbHTML(w, id) {
    var trail = PO.analyze.breadcrumbs(w, id);
    return '<div class="breadcrumbs">' + trail.map(function (n, i) {
      return (i ? '<span>›</span>' : '') + '<button data-crumb="' + U.esc(n.id) + '">' + U.esc(n.title || n.id) + '</button>';
    }).join('') + '</div>';
  }
  function wireCrumbs(host) {
    host.querySelectorAll('[data-crumb]').forEach(function (b) {
      b.onclick = function () { select(b.dataset.crumb, 'crumb'); };
    });
  }
  function tabHeadHTML(w, title, desc, opts) {
    opts = opts || {};
    var sel = state.nodeId && w.nodes[state.nodeId];
    return '<div class="toolbar"><div style="flex:1;min-width:200px"><h2 style="margin:0">' + U.esc(title) + '</h2>' +
      (desc ? '<div class="small muted">' + desc + '</div>' : '') + '</div>' +
      (sel ? '<span class="small muted">◉ <a href="#/node/' + U.esc(sel.id) + '">' + U.esc(sel.id) + '</a></span>' : '') +
      (opts.pin ? '<button class="btn sm" data-pin="' + opts.pin + '" title="Pin this tab side-by-side">📌 Pin</button>' : '') +
      '</div>' +
      (sel && !opts.noCrumb ? crumbHTML(w, sel.id) : '');
  }
  function wireTabHead(host) {
    wireCrumbs(host);
    host.querySelectorAll('[data-pin]').forEach(function (b) {
      b.onclick = function () {
        var t = b.dataset.pin;
        if (state.pinned.indexOf(t) < 0 && isSide(t)) state.pinned.push(t);
        persistTabs(); render();
      };
    });
    host.querySelectorAll('[data-goto]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.node) select(b.dataset.node, 'goto');
        if (b.dataset.tab) setTab(b.dataset.tab);
      };
    });
  }

  /* ----- filter bar (global, carries across tabs) ----- */
  function allTags(w) {
    var s = {};
    PO.analyze.nodesArr(w).forEach(function (n) { (n.tags || []).forEach(function (t) { s[t] = 1; }); });
    return Object.keys(s).sort();
  }
  function filterBarHTML(w, opts) {
    opts = opts || {};
    var f = state.filters;
    var types = ['any'].concat(PO.store.NODE_TYPES);
    var sts = ['any'].concat(PO.store.STATUSES);
    return '<div class="card"><div class="toolbar" style="margin:0">' +
      '<input type="search" id="gSearch" class="grow" placeholder="Filter text… ( / )" value="' + U.esc(f.q) + '">' +
      '<select id="fType" title="Type filter">' + types.map(function (t) { return '<option value="' + t + '"' + (f.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<select id="fStatus" title="Status filter">' + sts.map(function (t) { return '<option value="' + t + '"' + (f.status === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<select id="fTag" title="Tag filter"><option value="">any tag</option>' + allTags(w).map(function (t) { return '<option' + (f.tag === t ? ' selected' : '') + '>' + U.esc(t) + '</option>'; }).join('') + '</select>' +
      (opts.extra || '') +
      '<button class="btn sm" id="fClear">clear</button>' +
      '</div></div>';
  }
  function wireFilterBar(host, onChange) {
    var q = host.querySelector('#gSearch');
    if (q) q.addEventListener('input', U.debounce(function () { state.filters.q = q.value; if (onChange) onChange(); }, 220));
    ['fType', 'fStatus', 'fTag'].forEach(function (id) {
      var el = host.querySelector('#' + id);
      if (el) el.onchange = function () {
        if (id === 'fType') state.filters.type = el.value;
        if (id === 'fStatus') state.filters.status = el.value;
        if (id === 'fTag') state.filters.tag = el.value;
        if (onChange) onChange();
      };
    });
    var c = host.querySelector('#fClear');
    if (c) c.onclick = function () { state.filters = { q: '', type: 'any', status: 'any', tag: '', confMin: 0 }; render(); };
  }
  function passesFilters(n) {
    var f = state.filters;
    if (f.type !== 'any' && n.type !== f.type) return false;
    if (f.status !== 'any' && n.status !== f.status) return false;
    if (f.tag && (n.tags || []).indexOf(f.tag) < 0) return false;
    if (f.q && U.normalize((n.title || '') + ' ' + (n.text || '') + ' ' + (n.tags || []).join(' ')).indexOf(U.normalize(f.q)) < 0) return false;
    return true;
  }

  /* ----- tree ----- */
  function treeHTML(w, rootId, opts) {
    opts = opts || {};
    function kidHTML(id, depth) {
      var n = w.nodes[id];
      if (!n) return '';
      if (opts.skipFolders && n.type === 'folder') {
        return PO.analyze.childrenOf(w, id).map(function (c) { return kidHTML(c.id, depth); }).join('');
      }
      var kids = PO.analyze.childrenOf(w, id);
      var collapsed = state.collapsed[id];
      var sel = state.nodeId === id ? ' sel' : '';
      var dim = (!passesFilters(n) && opts.dimFiltered === false) ? '' : '';
      var hide = opts.applyFilters && !passesFilters(n) && !kids.some(function (k) { return passesFilters(k); }) ? ' style="display:none"' : '';
      var s = '<div class="tnode"' + hide + '>' +
        '<div class="trow' + sel + '" data-nid="' + U.esc(id) + '" draggable="' + (opts.draggable === false ? 'false' : 'true') + '">' +
        '<span class="st-bar st-' + n.status + '-b"></span>' +
        '<span class="caret" data-caret="' + U.esc(id) + '">' + (kids.length ? (collapsed ? '▶' : '▼') : '') + '</span>' +
        '<span class="ico">' + typeIcon(n.type) + '</span>' +
        '<span class="lbl" title="' + U.esc(n.title + ' · ' + id) + '">' + U.esc(n.title || id) + '</span>' +
        '<span class="meta">' + (n.stale && n.stale.flag ? '⚠ ' : '') + U.esc(id.split('.')[0]) + '</span>' +
        '</div>';
      if (kids.length && !collapsed) {
        s += '<div class="tkids">' + kids.map(function (k) { return kidHTML(k.id, depth + 1); }).join('') + '</div>';
      }
      return s + '</div>';
    }
    return '<div class="tree">' + kidHTML(rootId, 0) + '</div>';
  }
  function wireTree(host, opts) {
    opts = opts || {};
    host.querySelectorAll('[data-caret]').forEach(function (c) {
      c.onclick = function (ev) {
        ev.stopPropagation();
        var id = c.dataset.caret;
        state.collapsed[id] = !state.collapsed[id];
        render();
      };
    });
    host.querySelectorAll('.trow').forEach(function (row) {
      row.addEventListener('click', function (ev) {
        if (ev.target.dataset.caret) return;
        select(row.dataset.nid, 'tree');
        if (opts.onPick) opts.onPick(row.dataset.nid);
      });
      row.addEventListener('dblclick', function () { state.collapsed[row.dataset.nid] = !state.collapsed[row.dataset.nid]; render(); });
      // drag & drop re-parent
      row.addEventListener('dragstart', function (ev) {
        ev.dataTransfer.setData('text/plain', row.dataset.nid);
        ev.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', function (ev) { ev.preventDefault(); row.classList.add('drop-hint'); });
      row.addEventListener('dragleave', function () { row.classList.remove('drop-hint'); });
      row.addEventListener('drop', function (ev) {
        ev.preventDefault();
        row.classList.remove('drop-hint');
        var src = ev.dataTransfer.getData('text/plain');
        var dst = row.dataset.nid;
        if (src && dst && src !== dst) reparentNode(W(), src, dst);
      });
    });
  }
  function reparentNode(w, srcId, dstId) {
    var src = w.nodes[srcId], dst = w.nodes[dstId];
    if (!src || !dst) return;
    if (srcId === 'folder.root') { toast('Cannot move the workspace root.', 'warn'); return; }
    // prevent cycles
    var p = dst;
    while (p) { if (p.id === srcId) { toast('Cannot move a node inside itself.', 'bad'); return; } p = p.parent ? w.nodes[p.parent] : null; }
    var old = src.parent;
    src.parent = dstId;
    src.updated = U.nowISO();
    if (src.status === 'uncertain' && dstId !== 'folder.inbox') {
      src.status = 'asserted';
      src.why = (src.why || '') + ' Promoted by human re-parenting.';
    }
    // update partof edge
    w.edges = w.edges.filter(function (e) { return !(e.a === srcId && e.rel === 'partof'); });
    w.edges.push({ id: U.uid('e'), a: srcId, b: dstId, rel: 'partof', note: 'Moved by user.', auto: false, created: U.nowISO() });
    PO.store.log('move', '“' + src.title + '” moved from ' + (old || '—') + ' to ' + dstId + '.', srcId);
    PO.store.addVersion('move', 'Moved ' + srcId + ' → ' + dstId, { nodeId: srcId });
    PO.readme.touchParents(w, srcId);
    if (old) PO.readme.touchParents(w, old);
    PO.store.touch();
    toast('Moved to ' + (dst.title || dstId), 'ok');
    render();
  }

  /* ----- tiny syntax highlight + folding ----- */
  function highlightCode(code, lang) {
    var s = U.esc(code);
    // comments
    s = s.replace(/(\/\/[^\n]*|#[^\n]*|--[^\n]*)/g, '\x00C$1\x00');
    // strings
    s = s.replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="tok-s">$1</span>');
    // keywords
    s = s.replace(/\b(const|let|var|function|return|if|else|for|while|class|def|import|from|as|with|try|except|catch|throw|new|await|async|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|TABLE|AND|OR|NOT|NULL|true|false|None|nil|end|do|then)\b/g, '<span class="tok-k">$1</span>');
    // numbers
    s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-n">$1</span>');
    s = s.replace(/\x00C(.*?)\x00/g, '<span class="tok-c">$1</span>');
    return s;
  }
  function codeBlockHTML(code, lang, title) {
    var long = code.split('\n').length > 24;
    return '<div class="code-head"><strong>' + U.esc(title || (lang || 'code')) + '</strong>' +
      '<span class="tiny muted">' + code.split('\n').length + ' lines</span>' +
      '<span class="flex-spacer"></span><button class="btn sm ghost" data-fold>fold</button></div>' +
      '<pre data-code' + (long ? ' class="folded"' : '') + '><code>' + highlightCode(code, lang) + '</code></pre>';
  }
  function wireCode(host) {
    host.querySelectorAll('[data-fold]').forEach(function (b) {
      b.onclick = function () {
        var pre = b.closest('div').parentElement.querySelector('[data-code]') || host.querySelector('[data-code]');
        var pres = host.querySelectorAll('[data-code]');
        pres.forEach(function (p) { p.classList.toggle('folded'); });
      };
    });
    host.querySelectorAll('[data-code]').forEach(function (p) {
      p.addEventListener('click', function () { p.classList.remove('folded'); });
    });
  }

  /* ================= toast / modal ================= */
  function toast(msg, kind) {
    var box = $('toasts');
    if (!box) return;
    var d = document.createElement('div');
    d.className = 'toast ' + (kind || '');
    d.innerHTML = msg;
    box.appendChild(d);
    setTimeout(function () { d.style.opacity = '0'; d.style.transition = 'opacity .4s'; setTimeout(function () { d.remove(); }, 420); }, 3600);
    while (box.children.length > 5) box.firstChild.remove();
  }
  function openModal(headHTML, bodyHTML, buttons) {
    var root = $('modalRoot');
    root.innerHTML = '<div class="modal-veil"><div class="modal" role="dialog">' +
      '<div class="modal-head">' + headHTML + '<button class="btn icon sm" data-mclose>×</button></div>' +
      '<div class="modal-body">' + bodyHTML + '</div>' +
      '<div class="modal-foot"></div></div></div>';
    var foot = root.querySelector('.modal-foot');
    (buttons || [{ label: 'Close' }]).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '');
      btn.textContent = b.label;
      btn.onclick = function () { if (b.onClick) b.onClick(); else closeModal(); };
      foot.appendChild(btn);
    });
    root.querySelector('[data-mclose]').onclick = closeModal;
    root.querySelector('.modal-veil').addEventListener('mousedown', function (ev) { if (ev.target.classList.contains('modal-veil')) closeModal(); });
    return root;
  }
  function openModalWide(headHTML, bodyHTML, buttons) {
    var r = openModal(headHTML, bodyHTML, buttons);
    r.querySelector('.modal').classList.add('wide');
    return r;
  }
  function closeModal() { $('modalRoot').innerHTML = ''; }
  function markDirty() { var s = $('saveState'); if (s) { s.classList.add('dirty'); s.title = 'Unsaved changes…'; } }
  function markClean() { var s = $('saveState'); if (s) { s.classList.remove('dirty'); s.title = 'All changes saved'; } }

  /* ================= modals: help / new prompt / edit node ================= */
  function openHelpModal() {
    openModal('<h2>⌨ Keyboard shortcuts</h2>',
      '<table class="tbl"><tr><th>Keys</th><th>Action</th></tr>' +
      '<tr><td><kbd>Ctrl</kbd>+<kbd>1..7</kbd></td><td>Main tabs (Prompts … Recompile)</td></tr>' +
      '<tr><td><kbd>Alt</kbd>+<kbd>1..8</kbd></td><td>Side tabs (Tree … Assets)</td></tr>' +
      '<tr><td><kbd>/</kbd></td><td>Jump to search</td></tr>' +
      '<tr><td><kbd>N</kbd></td><td>New prompt</td></tr>' +
      '<tr><td><kbd>[</kbd> / <kbd>]</kbd></td><td>Previous / next node in tree order</td></tr>' +
      '<tr><td><kbd>Esc</kbd></td><td>Close dialog</td></tr>' +
      '<tr><td><kbd>?</kbd></td><td>This help</td></tr></table>' +
      '<p class="small muted">Every view has a deep link (<code>#/tab/node</code>) — saved workspaces reopen exactly where you left off, including pinned tabs.</p>');
  }

  function openNewPromptModal() {
    var w = W();
    var existing = w.prompts.map(function (p, i) {
      return '<option value="' + U.esc(p.id) + '">' + U.esc(p.name) + ' (add v' + (p.vers.length + 1) + ')</option>';
    }).join('');
    openModalWide('<h2>＋ Import prompt</h2>',
      '<div class="row"><div style="flex:1;min-width:200px"><label class="small muted">Target</label>' +
      '<select id="npTarget"><option value="__new">New prompt…</option>' + existing + '</select></div>' +
      '<div style="flex:2;min-width:200px"><label class="small muted">Name (for new prompts)</label><input type="text" id="npName" placeholder="e.g. Combat system v1"></div></div>' +
      '<p></p><label class="small muted">Prompt text — original wording is kept verbatim, paragraph by paragraph</label>' +
      '<textarea id="npText" style="min-height:260px" placeholder="Paste the full prompt here…"></textarea>' +
      '<div class="row small muted"><span id="npStats">0 words · ~0 tokens</span><span class="flex-spacer"></span>' +
      '<button class="btn sm ghost" id="npTemplate">insert template…</button>' +
      '<button class="btn sm ghost" id="npSample">load sample</button></div>',
      [{ label: 'Cancel' }, {
        label: 'Organize →', primary: true, onClick: function () {
          var text = ($('npText') || {}).value || '';
          if (!text.trim()) { toast('Paste some prompt text first.', 'warn'); return; }
          var target = ($('npTarget') || {}).value;
          var name = (($('npName') || {}).value || '').trim();
          var res;
          if (target === '__new') res = PO.ingest.ingestPrompt(w, name || undefined, text, {});
          else {
            var p = w.prompts.filter(function (x) { return x.id === target; })[0];
            res = PO.ingest.ingestPrompt(w, p.name, text, { promptId: p.id, incremental: true });
          }
          PO.readme.regenerateAll(w);
          PO.store.touch(); PO.store.persist();
          closeModal();
          state.tab = 'dashboard';
          render();
          toast('Organized “' + U.esc(res.prompt.name) + '” v' + res.ver + ': <strong>' + res.stats.created + '</strong> new · ' +
            res.stats.updated + ' updated · ' + res.stats.merged + ' merged · ' + res.stats.uncertain + ' uncertain · ' +
            res.stats.reqs + ' requirements.', 'ok');
        }
      }]);
    var ta = $('npText'), st = $('npStats');
    ta.addEventListener('input', function () {
      st.textContent = U.wordsOf(ta.value) + ' words · ~' + U.fmtNum(U.tokenEstimate(ta.value)) + ' tokens · ' + U.readingTimeMin(ta.value) + ' min read';
    });
    $('npSample').onclick = function () {
      ta.value = PO.app.samplePrompt();
      ta.dispatchEvent(new Event('input'));
    };
    $('npTemplate').onclick = function () {
      var tpl = w.templates;
      if (!tpl.length) { toast('No templates yet — add some in Prompts → Templates.', 'warn'); return; }
      ta.value = (ta.value ? ta.value + '\n\n' : '') + tpl[0].body;
      ta.dispatchEvent(new Event('input'));
      toast('Inserted template “' + U.esc(tpl[0].name) + '”.', 'ok');
    };
  }

  function openNodeEditModal(id) {
    var w = W(), n = w.nodes[id];
    if (!n) return;
    var folders = PO.analyze.nodesArr(w).filter(function (x) { return x.type === 'folder' || x.type === 'topic'; });
    openModal('<h2>Edit ' + U.esc(id) + '</h2>',
      '<label class="small muted">Title</label><input type="text" id="neTitle" value="' + U.esc(n.title) + '"><p></p>' +
      '<label class="small muted">Type</label><select id="neType">' + PO.store.NODE_TYPES.map(function (t) {
        return '<option' + (n.type === t ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select><p></p>' +
      '<label class="small muted">Parent</label><select id="neParent">' + folders.map(function (f) {
        return '<option value="' + U.esc(f.id) + '"' + (n.parent === f.id ? ' selected' : '') + '>' + U.esc(f.title + ' (' + f.id + ')') + '</option>';
      }).join('') + '</select><p></p>' +
      '<label class="small muted">Tags (comma-separated)</label><input type="text" id="neTags" value="' + U.esc((n.tags || []).join(', ')) + '"><p></p>' +
      '<label class="small muted">Text (verbatim source wording)</label><textarea id="neText" style="min-height:160px">' + U.esc(n.text) + '</textarea>' +
      '<div id="neImpact" class="small warn-t" style="margin-top:8px"></div>',
      [{ label: 'Cancel' }, {
        label: 'Save', primary: true, onClick: function () {
          var before = n.text;
          n.title = $('neTitle').value || n.title;
          n.type = $('neType').value;
          n.tags = $('neTags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          n.text = $('neText').value;
          n.updated = U.nowISO(); n.ver = (n.ver || 1) + 1;
          if (n.stale) n.stale = { flag: false, reason: '' };
          var np = $('neParent').value;
          var oldP = n.parent;
          if (np !== oldP) {
            n.parent = np;
            w.edges = w.edges.filter(function (e) { return !(e.a === n.id && e.rel === 'partof'); });
            w.edges.push({ id: U.uid('e'), a: n.id, b: np, rel: 'partof', note: 'Set in editor.', auto: false, created: U.nowISO() });
            PO.readme.touchParents(w, np);
            if (oldP) PO.readme.touchParents(w, oldP);
          }
          PO.store.addVersion('edit', 'Edited ' + n.id, { nodeId: n.id, before: before, after: n.text });
          PO.store.log('edit', 'Edited “' + n.title + '”.', n.id);
          var impacted = PO.analyze.markStale(w, n.id, '“' + n.title + '” was edited.');
          PO.readme.touchParents(w, n.id);
          PO.store.touch(); PO.store.persist();
          closeModal(); render();
          toast('Saved. ' + (impacted.length ? impacted.length + ' dependent(s) marked stale.' : 'No dependents affected.'), 'ok');
        }
      }]);
    $('neImpact').innerHTML = '⚠ ' + U.esc(PO.analyze.impactPreview(w, id).message);
  }

  function openAddEdgeModal(fromId) {
    var w = W();
    var cand = PO.analyze.nodesArr(w, true).filter(function (n) { return n.id !== fromId; }).slice(0, 400);
    openModal('<h2>Link from ' + U.esc(fromId) + '</h2>',
      '<label class="small muted">Relationship</label><select id="aeRel">' + PO.store.RELS.map(function (r) {
        return '<option value="' + r + '">' + PO.store.REL_LABEL[r] + '</option>';
      }).join('') + '</select><p></p>' +
      '<label class="small muted">Target node</label><input type="search" id="aeQ" placeholder="type to filter…"><p></p>' +
      '<div id="aeList" style="max-height:280px;overflow:auto"></div><p></p>' +
      '<label class="small muted">Note (optional)</label><input type="text" id="aeNote">',
      [{ label: 'Cancel' }, {
        label: 'Add link', primary: true, onClick: function () {
          var sel = document.querySelector('input[name=aet]:checked');
          if (!sel) { toast('Pick a target node.', 'warn'); return; }
          w.edges.push({ id: U.uid('e'), a: fromId, b: sel.value, rel: $('aeRel').value, note: $('aeNote').value || '', auto: false, created: U.nowISO() });
          PO.store.log('edge', fromId + ' —' + $('aeRel').value + '→ ' + sel.value, fromId);
          PO.store.touch(); PO.store.persist();
          closeModal(); render();
          toast('Link added.', 'ok');
        }
      }]);
    function drawList(q) {
      var list = cand.filter(function (n) {
        return !q || U.normalize(n.title + ' ' + n.id).indexOf(U.normalize(q)) >= 0;
      }).slice(0, 60);
      $('aeList').innerHTML = list.map(function (n) {
        return '<label class="row small" style="padding:3px 0"><input type="radio" name="aet" value="' + U.esc(n.id) + '"> ' +
          typeIcon(n.type) + ' <strong>' + U.esc(n.title) + '</strong> <span class="dim mono">' + U.esc(n.id) + '</span></label>';
      }).join('') || '<div class="empty">No matches.</div>';
    }
    drawList('');
    $('aeQ').addEventListener('input', function () { drawList($('aeQ').value); });
  }

  var api = {
    state: state, MAIN_TABS: MAIN_TABS, SIDE_TABS: SIDE_TABS,
    boot: boot, render: render, setTab: setTab, select: select,
    toast: toast, modal: openModal, modalWide: openModalWide, closeModal: closeModal,
    markDirty: markDirty, markClean: markClean,
    typeIcon: typeIcon, statusPill: statusPill, nodePills: nodePills,
    crumbHTML: crumbHTML, wireCrumbs: wireCrumbs,
    tabHeadHTML: tabHeadHTML, wireTabHead: wireTabHead,
    filterBarHTML: filterBarHTML, wireFilterBar: wireFilterBar, passesFilters: passesFilters,
    treeHTML: treeHTML, wireTree: wireTree, reparentNode: reparentNode,
    codeBlockHTML: codeBlockHTML, wireCode: wireCode, highlightCode: highlightCode,
    openNewPromptModal: openNewPromptModal, openNodeEditModal: openNodeEditModal, openAddEdgeModal: openAddEdgeModal,
    allTags: allTags, tabLabel: tabLabel
  };
  PO.ui = api;
})();
