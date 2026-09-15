/* ============================================================
   Prompt Organizer — ui-tabs-b.js
   Side tabs: Tree, Graph, Node, Source, READMEs, Scripts,
   Documents, Assets. (Mind map + timeline live under Graph.)
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  /* ================= TREE ================= */
  PO.uiTabs.tree = function (W, host, ui, opts) {
    host.innerHTML = ui.tabHeadHTML(W, 'File tree', 'Branching workspace. Drag any row onto another to re-parent. <kbd>[</kbd>/<kbd>]</kbd> steps selection.', { pin: 'tree' }) +
      (opts && opts.pinned ? '' : ui.filterBarHTML(W)) +
      '<div class="toolbar"><button class="btn sm" id="tExpand">▾ expand all</button><button class="btn sm" id="tCollapse">▸ collapse</button>' +
      '<button class="btn sm" id="tFolder">＋ folder</button></div>' +
      '<div class="card" id="treeBox">' + ui.treeHTML(W, 'folder.root', { applyFilters: !!(ui.state.filters.q || ui.state.filters.type !== 'any' || ui.state.filters.status !== 'any' || ui.state.filters.tag) }) + '</div>';
    ui.wireTabHead(host);
    if (!(opts && opts.pinned)) ui.wireFilterBar(host, function () { ui.render(); });
    ui.wireTree(host.querySelector('#treeBox'));
    host.querySelector('#tExpand').onclick = function () { ui.state.collapsed = {}; ui.render(); };
    host.querySelector('#tCollapse').onclick = function () {
      Object.keys(W.nodes).forEach(function (id) { if (W.nodes[id].type === 'folder' && id !== 'folder.root') ui.state.collapsed[id] = true; });
      ui.render();
    };
    host.querySelector('#tFolder').onclick = function () {
      ui.modal('<h2>New folder</h2>', '<input type="text" id="nfName" placeholder="Folder name">',
        [{ label: 'Cancel' }, {
          label: 'Create', primary: true, onClick: function () {
            var name = (U.$('nfName') || {}).value || 'New folder', t = U.nowISO();
            var id = PO.ingest.makeId(W, 'folder', name);
            W.nodes[id] = {
              id: id, title: name, type: 'folder', status: 'asserted', text: '', quote: '', anchor: null,
              parent: 'folder.root', tags: [], entities: [], conf: 1, created: t, updated: t, ver: 1,
              why: 'Created by user.', stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
            };
            PO.readme.regenerateFolder(W, id, 'created');
            PO.store.log('folder', 'Folder ' + id + ' created.', id);
            PO.store.touch(); PO.store.persist(); ui.closeModal(); ui.render();
          }
        }]);
    };
  };

  /* ================= GRAPH ================= */
  PO.uiTabs.graph = function (W, host, ui, opts) {
    var gf = ui.state.graphFilter;
    var view = ui.state.graphView || 'graph';
    host.innerHTML = ui.tabHeadHTML(W, 'Relationship graph', 'Drag a node onto another to re-parent · scroll to zoom · drag background to pan.', { pin: 'graph' }) +
      '<div class="subtabs">' + [['graph', '🕸 Graph'], ['mind', '🧠 Mind map'], ['time', '⏳ Timeline']].map(function (s) {
        return '<button class="subtab" data-gv="' + s[0] + '" aria-selected="' + (view === s[0]) + '">' + s[1] + '</button>';
      }).join('') + '</div><div id="gBody"></div>';
    ui.wireTabHead(host);
    host.querySelectorAll('[data-gv]').forEach(function (b) { b.onclick = function () { ui.state.graphView = b.dataset.gv; ui.render(); }; });
    var body = host.querySelector('#gBody');
    if (view === 'mind') {
      body.innerHTML = '<div class="toolbar"><span class="small muted">Root:</span><strong>' + U.esc((W.nodes[ui.state.nodeId] || W.nodes['folder.root'] || {}).title || 'root') + '</strong>' +
        '<span class="small muted">(uses current selection — pick another in the Tree)</span></div><div id="mmBox"></div>';
      PO.graph.renderMindmap(body.querySelector('#mmBox'), W, ui.state.nodeId || 'folder.root');
      return;
    }
    if (view === 'time') {
      body.innerHTML = '<div class="card" id="tlBox"></div>';
      PO.graph.renderTimeline(body.querySelector('#tlBox'), W);
      return;
    }
    body.innerHTML = '<div class="card"><div class="toolbar" style="margin:0">' +
      '<select id="gType" style="max-width:130px"><option value="any">any type</option>' + PO.store.NODE_TYPES.map(function (t) {
        return '<option' + (gf.type === t ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select>' +
      '<select id="gStatus" style="max-width:130px"><option value="any">any status</option>' + PO.store.STATUSES.map(function (t) {
        return '<option' + (gf.status === t ? ' selected' : '') + '>' + t + '</option>';
      }).join('') + '</select>' +
      '<select id="gRel" style="max-width:150px"><option value="any">any relation</option>' + PO.store.RELS.map(function (t) {
        return '<option value="' + t + '"' + (gf.rel === t ? ' selected' : '') + '>' + PO.store.REL_LABEL[t] + '</option>';
      }).join('') + '</select>' +
      '<label class="small"><input type="checkbox" id="gFocus"' + (gf.focus ? ' checked' : '') + '> focus selection ±2 hops</label>' +
      '<label class="small"><input type="checkbox" id="gHide"' + (gf.hideFolders ? ' checked' : '') + '> hide folders</label>' +
      '<span class="flex-spacer"></span>' +
      '<button class="btn sm" id="gArrange" title="Snap nodes to a tidy anti-overlap grid">✨ Auto-arrange</button>' +
      '<button class="btn sm" id="gClearArr" title="Forget saved positions and re-layout">clear arrangement</button>' +
      '<button class="btn sm" id="gReset">reset view</button></div></div>' +
      '<div class="tiny muted" style="margin:4px 2px 8px">Drag nodes to arrange them — positions are saved with the workspace. Drag a node onto another to re-parent it.</div>' +
      '<div id="graphWrap"></div><div class="graph-legend">' +
      Object.keys(PO.graph.TYPE_COLORS).map(function (t) { return '<span><span class="dot" style="background:' + PO.graph.TYPE_COLORS[t] + '"></span>' + t + '</span>'; }).join('') + '</div>';
    var ctl = PO.graph.render(body.querySelector('#graphWrap'), W, {
      selectedId: ui.state.nodeId, filter: Object.assign({}, gf, { q: ui.state.filters.q, focus: gf.focus ? (ui.state.nodeId || null) : null }),
      onSelect: function (id) { ui.select(id, 'graph'); },
      onReparent: function (src, dst) { ui.reparentNode(W, src, dst); PO.store.persist(); },
      onPositions: function (pos) { PO.graph.savePositions(W, pos); PO.store.persist(); }
    });
    body.querySelector('#gType').onchange = function (e) { gf.type = e.target.value; ui.render(); };
    body.querySelector('#gStatus').onchange = function (e) { gf.status = e.target.value; ui.render(); };
    body.querySelector('#gRel').onchange = function (e) { gf.rel = e.target.value; ui.render(); };
    body.querySelector('#gFocus').onchange = function (e) { gf.focus = e.target.checked; ui.render(); };
    body.querySelector('#gHide').onchange = function (e) { gf.hideFolders = e.target.checked; ui.render(); };
    body.querySelector('#gReset').onclick = function () { ctl.reset(); };
    body.querySelector('#gClearArr').onclick = function () { PO.graph.savePositions(W, {}); ui.render(); ui.toast('Arrangement cleared — nodes re-flowed by layer.', 'ok'); };
    body.querySelector('#gArrange').onclick = function () {
      var pos = ctl.pos || {};
      var arr = Object.keys(pos).map(function (k) { return { id: k, x: pos[k].x, y: pos[k].y }; });
      arr.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      var cols = Math.max(3, Math.ceil(Math.sqrt(arr.length)));
      var cellW = Math.min(180, (ctl.svg.clientWidth || 900) / cols);
      var cellH = 64;
      var neat = {};
      arr.forEach(function (n, i) {
        var col = i % cols, row = Math.floor(i / cols);
        neat[n.id] = { x: Math.round(90 + col * cellW), y: Math.round(40 + row * cellH) };
      });
      PO.graph.savePositions(W, neat);
      PO.store.persist();
      ui.render();
      ui.toast('Arranged ' + arr.length + ' nodes into a tidy grid.', 'ok');
    };
  };

  /* ================= NODE ================= */
  PO.uiTabs.node = function (W, host, ui, opts) {
    var n = ui.state.nodeId && W.nodes[ui.state.nodeId];
    if (!n) {
      host.innerHTML = ui.tabHeadHTML(W, 'Node', 'Select any item to inspect it here.', { pin: 'node' }) +
        '<div class="empty">Nothing selected. Pick a node in the Tree, Graph, or Search.<br><br><button class="btn" data-goto data-tab="tree">🌳 Open tree</button></div>';
      ui.wireTabHead(host);
      return;
    }
    var back = PO.analyze.backlinks(W, n.id), fwd = PO.analyze.forwardLinks(W, n.id);
    var kids = PO.analyze.childrenOf(W, n.id);
    var p = n.anchor ? W.prompts.filter(function (x) { return x.id === n.anchor.promptId; })[0] : null;
    var merged = (n.mergedFrom || []).length;
    host.innerHTML = ui.tabHeadHTML(W, ui.typeIcon(n.type) + ' ' + n.title, '<span class="mono">' + U.esc(n.id) + '</span>', { pin: 'node' }) +
      (n.status === 'inferred' ? '<div class="inferred-box">🔮 <strong>Inferred by the organizer</strong> — assistive and reversible. ' +
        '<button class="btn sm" id="nWhy">? Why is this here</button> <button class="btn sm" id="nRevert">↩ Revert to inbox</button></div>' : '') +
      ((n.stale && n.stale.flag) ? '<div class="card" style="border-color:var(--warn)"><span class="warn-t">⚠ Stale:</span> ' + U.esc(n.stale.reason || '') +
        ' <button class="btn sm ok" id="nFresh">✓ Mark fresh</button></div>' : '') +
      '<div class="card"><div class="row">' + ui.nodePills(n) +
      '<span class="flex-spacer"></span><span class="small muted">v' + (n.ver || 1) + ' · conf ' + Math.round((n.conf || 0) * 100) + '% · updated ' + U.fmtAgo(n.updated) + '</span></div>' +
      '<dl class="kv" style="margin-top:10px"><dt>ID (stable)</dt><dd class="mono">' + U.esc(n.id) + '</dd>' +
      '<dt>Source</dt><dd>' + (p ? U.esc(p.name) + ' <span class="mono tiny">v' + n.anchor.ver + ' [' + n.anchor.start + '–' + n.anchor.end + ']</span> <button class="btn sm ghost" data-goto data-tab="source">⌖ highlight</button>' : '<span class="dim">—</span>') + '</dd>' +
      (n.quote && n.status === 'inferred' ? '<dt>Verbatim quote</dt><dd><div class="quoteblock">' + U.esc(n.quote) + '</div></dd>' : '') +
      '<dt>Entities</dt><dd>' + ((n.entities || []).map(function (e) { return '<span class="pill">' + U.esc(e) + '</span>'; }).join('') || '<span class="dim">—</span>') + '</dd>' +
      ((n.aliases || []).length ? '<dt>Aliases</dt><dd>' + n.aliases.map(U.esc).join(', ') + '</dd>' : '') + '</dl></div>' +
      '<div class="card"><h3>Full text (verbatim)</h3>' +
      (n.type === 'script' ? ui.codeBlockHTML(n.text || '', guessLang(n.text), 'script') : '<pre>' + U.esc(n.text || '(empty)') + '</pre>') + '</div>' +
      '<div class="two-col"><div class="card"><h3>Connections (' + (back.length + fwd.length) + ')</h3>' + connList(W, back, 'in') + connList(W, fwd, 'out') +
      '<div class="row"><button class="btn sm" id="nLink">＋ link</button></div></div>' +
      '<div><div class="card"><h3>Children (' + kids.length + ')</h3>' +
      (kids.slice(0, 30).map(function (k) { return '<div class="small">' + ui.typeIcon(k.type) + ' <a href="#/node/' + U.esc(k.id) + '">' + U.esc(k.title) + '</a></div>'; }).join('') || '<p class="dim small">None.</p>') + '</div>' +
      (merged ? '<div class="card"><h3>Merged history (' + merged + ')</h3>' + n.mergedFrom.map(function (m) {
        return '<div class="small" style="padding:3px 0">⧉ <strong>' + U.esc(m.title) + '</strong> <span class="dim">' + U.esc(m.reason || '') + ' · ' + U.fmtAgo(m.at) + '</span></div>';
      }).join('') + '</div>' : '') + '</div></div>' +
      '<div class="toolbar"><button class="btn sm primary" id="nEdit">✎ Edit</button>' +
      '<button class="btn sm" id="nFav">' + (W.favorites.indexOf(n.id) >= 0 ? '★ Unfavorite' : '☆ Favorite') + '</button>' +
      '<button class="btn sm" id="nRecomp">🧩 Recompile subtree</button>' +
      '<button class="btn sm danger" id="nDel">Delete</button></div>';
    ui.wireTabHead(host); ui.wireCode(host);
    function bind(id, fn) { var b = host.querySelector('#' + id); if (b) b.onclick = fn; }
    bind('nEdit', function () { ui.openNodeEditModal(n.id); });
    bind('nLink', function () { ui.openAddEdgeModal(n.id); });
    bind('nFav', function () {
      var i = W.favorites.indexOf(n.id);
      if (i >= 0) W.favorites.splice(i, 1); else W.favorites.push(n.id);
      PO.store.touch(); PO.store.persist(); ui.render();
    });
    bind('nRecomp', function () { ui.state.recomp.root = n.id; ui.setTab('recompile'); });
    bind('nFresh', function () {
      n.stale = { flag: false, reason: '' }; n.updated = U.nowISO();
      PO.store.log('fresh', 'Marked ' + n.id + ' fresh.', n.id);
      PO.store.touch(); PO.store.persist(); ui.render();
    });
    bind('nRevert', function () {
      n.status = 'uncertain'; n.parent = 'folder.inbox'; n.updated = U.nowISO();
      PO.store.log('revert', 'Reverted inferred ' + n.id + ' to inbox.', n.id);
      PO.readme.touchParents(W, 'folder.inbox');
      PO.store.touch(); PO.store.persist(); ui.render();
    });
    bind('nWhy', function () {
      ui.modal('<h2>Why is this here?</h2>', '<p>' + U.esc(n.why || '—') + '</p>' +
        (n.quote ? '<div class="quoteblock">' + U.esc(n.quote) + '</div>' : '') +
        (n.anchor ? '<p class="mono small">anchor: ' + U.esc(n.anchor.promptId + ' v' + n.anchor.ver + ' [' + n.anchor.start + '–' + n.anchor.end + ']') + '</p>' : ''));
    });
    bind('nDel', function () {
      ui.modal('<h2>Delete ' + U.esc(n.id) + '?</h2>', '<p>Blocked if other items depend on it. The deletion is logged and versioned.</p>',
        [{ label: 'Cancel' }, {
          label: 'Delete', danger: true, onClick: function () {
            var deps = PO.analyze.impactOf(W, n.id);
            if (deps.length) { ui.toast('Blocked: ' + deps.length + ' dependent(s).', 'bad'); return; }
            W.edges = W.edges.filter(function (e) { return e.a !== n.id && e.b !== n.id; });
            delete W.nodes[n.id];
            PO.store.addVersion('delete', 'Deleted ' + n.id, { nodeId: n.id, before: n.text, after: '' });
            PO.store.log('delete', 'Deleted ' + n.id + '.', null);
            ui.state.nodeId = null;
            PO.store.touch(); PO.store.persist(); ui.closeModal(); ui.render();
          }
        }]);
    });
  };
  function connList(W, es, dir) {
    if (!es.length) return '';
    return es.slice(0, 40).map(function (e) {
      var o = W.nodes[dir === 'in' ? e.a : e.b];
      return '<div class="small" style="padding:2px 0">' + (dir === 'in' ? '←' : '→') + ' <span class="pill">' + (PO.store.REL_LABEL[e.rel] || e.rel) + '</span> ' +
        (o ? '<a href="#/node/' + U.esc(o.id) + '">' + U.esc(o.title) + '</a>' : '<span class="dim">?</span>') + '</div>';
    }).join('');
  }
  function guessLang(t) {
    t = String(t || '');
    if (/^\s*</.test(t) || /<[a-z][^>]*>/i.test(t)) return 'html';
    if (/\b(def |import |print\(|:\s*$)/m.test(t)) return 'python';
    if (/SELECT|FROM|WHERE/i.test(t)) return 'sql';
    return 'javascript';
  }

  /* ================= SOURCE ================= */
  PO.uiTabs.source = function (W, host, ui, opts) {
    var n = ui.state.nodeId && W.nodes[ui.state.nodeId];
    var pid = ui.state.srcPrompt || (n && n.anchor ? n.anchor.promptId : (W.prompts[0] || {}).id);
    var p = W.prompts.filter(function (x) { return x.id === pid; })[0] || W.prompts[0];
    if (!p) {
      host.innerHTML = ui.tabHeadHTML(W, 'Source traces', 'Every item links back to the exact paragraph it came from.', { pin: 'source' }) +
        '<div class="empty">No prompts yet.</div>';
      ui.wireTabHead(host);
      return;
    }
    var anchors = [];
    PO.analyze.nodesArr(W, true).forEach(function (x) {
      if (x.anchor && x.anchor.promptId === p.id) anchors.push(x);
    });
    anchors.sort(function (a, b) { return a.anchor.start - b.anchor.start; });
    // render prompt text with highlight ranges
    var txt = p.text, html = '', cur = 0;
    var marks = anchors.map(function (x) { return { s: x.anchor.start, e: x.anchor.end, id: x.id, sel: n && x.id === n.id }; })
      .filter(function (m) { return m.s != null && m.e > m.s; })
      .sort(function (a, b) { return a.s - b.s; });
    // clip overlaps simply
    marks.forEach(function (m) {
      if (m.s < cur) m.s = cur;
      if (m.e <= m.s) return;
      html += U.esc(txt.slice(cur, m.s));
      html += '<span class="' + (m.sel ? 'src-hl' : '') + '" data-anchor="' + U.esc(m.id) + '" style="' +
        (m.sel ? '' : 'background:#1b2740;border-radius:3px;') + 'cursor:pointer" title="' + U.esc(m.id) + '">' + U.esc(txt.slice(m.s, m.e)) + '</span>';
      cur = m.e;
    });
    html += U.esc(txt.slice(cur));
    host.innerHTML = ui.tabHeadHTML(W, 'Source traces', 'Click any tinted paragraph to jump to its node. The selected node is highlighted.', { pin: 'source' }) +
      '<div class="toolbar"><select id="sPrompt" style="max-width:280px">' + W.prompts.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === p.id ? ' selected' : '') + '>' + U.esc(x.name) + '</option>';
      }).join('') + '</select><span class="small muted">' + anchors.length + ' traced items in this prompt</span>' +
      (n && n.anchor ? '<span class="small">⌖ <strong>' + U.esc(n.id) + '</strong> @ chars ' + n.anchor.start + '–' + n.anchor.end + '</span>' : '') + '</div>' +
      '<div class="card"><pre id="srcPre" style="white-space:pre-wrap">' + html + '</pre></div>';
    ui.wireTabHead(host);
    host.querySelector('#sPrompt').onchange = function (e) { ui.state.srcPrompt = e.target.value; ui.render(); };
    host.querySelectorAll('[data-anchor]').forEach(function (s) {
      s.onclick = function () { ui.select(s.dataset.anchor, 'source'); };
    });
    var hl = host.querySelector('.src-hl');
    if (hl) setTimeout(function () { hl.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 80);
  }

  /* ================= READMEs ================= */
  PO.uiTabs.readmes = function (W, host, ui, opts) {
    var folders = PO.analyze.nodesArr(W).filter(function (n) { return n.type === 'folder'; });
    var fid = ui.state.readmeSel && W.nodes[ui.state.readmeSel] ? ui.state.readmeSel : 'folder.root';
    var doc = ui.state.readmeDoc || 'readme';
    var docs = [['readme', '📄 README'], ['glossary', '📖 Glossary'], ['acronyms', '🔤 Acronyms'], ['index', '🗂 Index'], ['sourcemap', '🗺 Source map']];
    host.innerHTML = ui.tabHeadHTML(W, 'READMEs & knowledge', 'Regenerated on every folder change — with a changelog entry.', { pin: 'readmes' }) +
      '<div class="toolbar"><select id="rFolder" style="max-width:260px">' + folders.map(function (f) {
        return '<option value="' + f.id + '"' + (f.id === fid ? ' selected' : '') + '>' + U.esc(f.title) + '</option>';
      }).join('') + '</select>' +
      '<button class="btn sm" id="rRegen">↻ regenerate</button>' +
      '<button class="btn sm" id="rCopy">⧉ copy</button></div>' +
      '<div class="subtabs">' + docs.map(function (d) {
        return '<button class="subtab" data-rdoc="' + d[0] + '" aria-selected="' + (doc === d[0]) + '">' + d[1] + '</button>';
      }).join('') + '</div><div class="card" id="rBody"></div>';
    ui.wireTabHead(host);
    host.querySelector('#rFolder').onchange = function (e) { ui.state.readmeSel = e.target.value; ui.render(); };
    host.querySelectorAll('[data-rdoc]').forEach(function (b) { b.onclick = function () { ui.state.readmeDoc = b.dataset.rdoc; ui.render(); }; });
    host.querySelector('#rRegen').onclick = function () {
      PO.readme.regenerateFolder(W, fid, 'manual refresh');
      PO.store.touch(); PO.store.persist(); ui.render(); ui.toast('README regenerated.', 'ok');
    };
    var body = host.querySelector('#rBody');
    var md = '';
    if (doc === 'readme') md = (W.readmes[fid] || {}).md || PO.readme.regenerateFolder(W, fid, 'first view');
    else if (doc === 'glossary') md = '# Glossary\n\n' + PO.readme.glossary(W).map(function (g) { return '- **' + g.term + '** `' + g.nodeId + '` — ' + (g.def || '_no inline definition_'); }).join('\n');
    else if (doc === 'acronyms') md = '# Acronyms\n\n' + (PO.readme.acronyms(W).map(function (a) { return '- **' + a.acr + '**' + (a.full ? ' — ' + a.full : '') + ' `' + a.nodeId + '`'; }).join('\n') || '_None found._');
    else if (doc === 'index') md = '# Index\n\n' + PO.readme.indexDocs(W).map(function (r) { return '- **' + r.title + '** `' + r.id + '` _' + r.type + '/' + r.status + '_'; }).join('\n');
    else md = '# Source map\n\n' + PO.readme.sourceMap(W).map(function (s) {
      return '## ' + s.prompt.name + '\n\n' + s.anchors.map(function (a) { return '- `' + a.nodeId + '` [' + a.start + '–' + a.end + '] ' + a.title; }).join('\n');
    }).join('\n\n');
    body.innerHTML = PO.readme.mdToHTML(md);
    host.querySelector('#rCopy').onclick = function () { U.copyText(md, 'Document copied'); };
  };

  /* ================= SCRIPTS ================= */
  PO.uiTabs.scripts = function (W, host, ui, opts) {
    var list = PO.analyze.nodesArr(W, true).filter(function (n) { return n.type === 'script'; });
    var sel = ui.state.nodeId && W.nodes[ui.state.nodeId] && W.nodes[ui.state.nodeId].type === 'script' ? W.nodes[ui.state.nodeId] : list[0];
    host.innerHTML = ui.tabHeadHTML(W, 'Scripts', 'Syntax-highlighted, foldable, and linked both ways to what they implement.', { pin: 'scripts' }) +
      (list.length ? '<div class="two-col"><div><div class="card"><h3>' + list.length + ' script(s)</h3><div class="list-compact">' +
        list.map(function (s) {
          var impl = W.edges.filter(function (e) { return e.a === s.id && e.rel === 'implements'; }).length;
          return '<div class="search-hit" data-sid="' + U.esc(s.id) + '"><strong>' + U.esc(s.title) + '</strong> ' + ui.statusPill(s) +
            '<div class="tiny dim">' + U.esc(s.id) + ' · implements ' + impl + ' · ' + (s.text || '').split('\n').length + ' lines</div></div>';
        }).join('') + '</div></div></div><div id="sDetail"></div></div>'
        : '<div class="empty">No scripts extracted. Code fences in prompts become scripts automatically.<br><br><button class="btn" id="sAdd">＋ Add script</button></div>');
    ui.wireTabHead(host);
    host.querySelectorAll('[data-sid]').forEach(function (x) { x.onclick = function () { ui.select(x.dataset.sid, 'scripts'); }; });
    var add = host.querySelector('#sAdd');
    if (add) add.onclick = function () { scriptModal(W, ui, null); };
    if (sel) {
      var d = host.querySelector('#sDetail');
      var impls = W.edges.filter(function (e) { return e.a === sel.id && e.rel === 'implements'; });
      var users = PO.analyze.backlinks(W, sel.id).filter(function (e) { return e.rel !== 'partof'; });
      d.innerHTML = '<div class="card"><div class="row"><h3 style="flex:1">💻 ' + U.esc(sel.title) + '</h3>' +
        '<button class="btn sm" id="sEdit">✎</button><button class="btn sm" id="sCopy">⧉</button></div>' +
        '<div class="small muted">implements: ' + (impls.map(function (e) { var n = W.nodes[e.b]; return n ? '<a href="#/node/' + U.esc(n.id) + '">' + U.esc(n.title) + '</a>' : '?'; }).join(' · ') || '—') +
        '<br>referenced by: ' + (users.map(function (e) { var n = W.nodes[e.a]; return n ? '<a href="#/node/' + U.esc(n.id) + '">' + U.esc(n.title) + '</a>' : '?'; }).join(' · ') || '—') + '</div><p></p>' +
        ui.codeBlockHTML(sel.text || '', guessLang(sel.text), sel.id) + '</div>';
      ui.wireCode(d);
      d.querySelector('#sEdit').onclick = function () { scriptModal(W, ui, sel.id); };
      d.querySelector('#sCopy').onclick = function () { U.copyText(sel.text || '', 'Script copied'); };
    }
  };
  function scriptModal(W, ui, id) {
    var n = id ? W.nodes[id] : null;
    ui.modal('<h2>' + (n ? 'Edit script' : 'New script') + '</h2>',
      '<input type="text" id="scTitle" placeholder="Title" value="' + U.esc(n ? n.title : '') + '"><p></p><textarea id="scText" style="min-height:220px;font-family:var(--mono)">' + U.esc(n ? n.text : '') + '</textarea>',
      [{ label: 'Cancel' }, {
        label: 'Save', primary: true, onClick: function () {
          var t = U.nowISO();
          if (n) {
            var before = n.text;
            n.title = U.$('scTitle').value || n.title; n.text = U.$('scText').value; n.updated = t; n.ver++;
            PO.store.addVersion('edit', 'Edited script ' + n.id, { nodeId: n.id, before: before, after: n.text });
          } else {
            var nid = PO.ingest.makeId(W, 'script', U.$('scTitle').value || 'script');
            W.nodes[nid] = {
              id: nid, title: U.$('scTitle').value || 'script', type: 'script', status: 'asserted',
              text: U.$('scText').value, quote: '', anchor: null, parent: 'folder.scripts',
              tags: PO.ingest.suggestTags(U.$('scText').value), entities: PO.ingest.extractEntities(U.$('scText').value),
              conf: 1, created: t, updated: t, ver: 1, why: 'Added by user.', stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
            };
            PO.ingest.inferEdges(W, W.nodes[nid]);
            PO.store.log('script', 'Script ' + nid + ' added.', nid);
            ui.state.nodeId = nid;
          }
          PO.store.touch(); PO.store.persist(); ui.closeModal(); ui.render();
        }
      }]);
  }
  function guessLang(t) {
    t = String(t || '');
    if (/^\s*</.test(t) || /<[a-z][^>]*>/i.test(t)) return 'html';
    if (/\b(def |import |print\()/m.test(t)) return 'python';
    if (/SELECT|FROM/i.test(t)) return 'sql';
    return 'javascript';
  }

  /* ================= DOCUMENTS ================= */
  PO.uiTabs.documents = function (W, host, ui, opts) {
    var list = PO.analyze.nodesArr(W, true).filter(function (n) { return n.type === 'document'; });
    host.innerHTML = ui.tabHeadHTML(W, 'Documents', 'Long-form references and specs extracted from prompts.', { pin: 'documents' }) +
      '<div class="toolbar"><button class="btn sm primary" id="dAdd">＋ Document</button><span class="small muted">' + list.length + ' document(s)</span></div>' +
      (list.map(function (d) {
        var open = ui.state.nodeId === d.id;
        return '<div class="card"><div class="row"><h3 style="flex:1">📑 ' + U.esc(d.title) + '</h3>' + ui.statusPill(d) +
          '<button class="btn sm ghost" data-dopen="' + U.esc(d.id) + '">' + (open ? '▾' : '▸') + '</button></div>' +
          '<div class="small muted">' + U.wordsOf(d.text) + ' words · ' + (d.tags || []).map(function (t) { return '#' + t; }).join(' ') + '</div>' +
          (open ? '<hr><pre style="white-space:pre-wrap">' + U.esc(d.text) + '</pre><div class="row"><button class="btn sm" data-dedit="' + U.esc(d.id) + '">✎ Edit</button><button class="btn sm" data-dcopy="' + U.esc(d.id) + '">⧉ Copy</button></div>' : '') + '</div>';
      }).join('') || '<div class="empty">No documents yet.</div>');
    ui.wireTabHead(host);
    host.querySelector('#dAdd').onclick = function () {
      ui.modal('<h2>New document</h2>', '<input type="text" id="dcTitle" placeholder="Title"><p></p><textarea id="dcText" style="min-height:200px"></textarea>',
        [{ label: 'Cancel' }, {
          label: 'Save', primary: true, onClick: function () {
            var t = U.nowISO(), title = U.$('dcTitle').value || 'Untitled doc';
            var id = PO.ingest.makeId(W, 'document', title);
            W.nodes[id] = {
              id: id, title: title, type: 'document', status: 'asserted', text: U.$('dcText').value, quote: '', anchor: null,
              parent: 'folder.documents', tags: PO.ingest.suggestTags(U.$('dcText').value), entities: [], conf: 1,
              created: t, updated: t, ver: 1, why: 'Added by user.', stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
            };
            PO.store.log('doc', 'Document ' + id + ' added.', id);
            PO.store.touch(); PO.store.persist(); ui.closeModal(); ui.render();
          }
        }]);
    };
    host.querySelectorAll('[data-dopen]').forEach(function (b) {
      b.onclick = function () { ui.select(b.dataset.dopen, 'documents'); };
    });
    host.querySelectorAll('[data-dedit]').forEach(function (b) { b.onclick = function () { ui.openNodeEditModal(b.dataset.dedit); }; });
    host.querySelectorAll('[data-dcopy]').forEach(function (b) { b.onclick = function () { U.copyText(W.nodes[b.dataset.dcopy].text || '', 'Document copied'); }; });
  };

  /* ================= ASSETS ================= */
  PO.uiTabs.assets = function (W, host, ui, opts) {
    var list = PO.analyze.nodesArr(W, true).filter(function (n) { return n.type === 'asset'; });
    host.innerHTML = ui.tabHeadHTML(W, 'Assets', 'Images, diagrams, PDFs — with metadata and usage tracking.', { pin: 'assets' }) +
      '<div class="toolbar"><button class="btn sm primary" id="aUp">⤒ Upload asset</button><button class="btn sm" id="aLink">🔗 Add by URL</button>' +
      '<span class="small muted">' + list.length + ' asset(s). Uploads under ~1.5MB are embedded so snapshots stay portable.</span></div>' +
      '<input type="file" id="aFile" hidden accept="image/*,.pdf,.svg,.txt,.md,.json,.csv">' +
      '<div class="asset-grid">' + list.map(function (a) {
        var refs = PO.analyze.backlinks(W, a.id).length + PO.analyze.forwardLinks(W, a.id).length;
        var prev = assetPreview(a);
        return '<div class="asset-card" data-aid="' + U.esc(a.id) + '">' + prev +
          '<div class="small" style="margin-top:6px"><strong>' + U.esc(a.title) + '</strong></div>' +
          '<div class="tiny dim">' + U.esc(a.id) + '<br>' + U.esc((a.meta && a.meta.kind) || 'link') + ' · used by ' + refs + '</div></div>';
      }).join('') + '</div>' + (list.length ? '' : '<div class="empty">No assets. Prompts that reference images/files create asset entries automatically.</div>');
    ui.wireTabHead(host);
    host.querySelector('#aUp').onclick = function () { host.querySelector('#aFile').click(); };
    host.querySelector('#aFile').addEventListener('change', function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var dataUrl = rd.result;
        if (String(dataUrl).length > 1500000) { ui.toast('File too large to embed (>1.5MB). Storing as linked reference instead.', 'warn'); }
        addAsset(W, ui, f.name, f.type, String(dataUrl).length > 1500000 ? '' : dataUrl, f.size);
      };
      rd.readAsDataURL(f);
    });
    host.querySelector('#aLink').onclick = function () {
      ui.modal('<h2>Add asset by URL</h2>', '<input type="text" id="alTitle" placeholder="Title"><p></p><input type="text" id="alUrl" placeholder="https://…">',
        [{ label: 'Cancel' }, {
          label: 'Add', primary: true, onClick: function () {
            addAsset(W, ui, U.$('alTitle').value || 'Linked asset', 'link', U.$('alUrl').value, 0);
            ui.closeModal();
          }
        }]);
    };
    host.querySelectorAll('[data-aid]').forEach(function (c) {
      c.onclick = function () { assetModal(W, ui, c.dataset.aid); };
    });
  };
  function addAsset(W, ui, title, mime, dataUrl, size) {
    var t = U.nowISO();
    var id = PO.ingest.makeId(W, 'asset', title);
    W.nodes[id] = {
      id: id, title: title, type: 'asset', status: 'asserted',
      text: 'Asset: ' + title + ' (' + (mime || 'unknown') + ')', quote: '', anchor: null,
      parent: 'folder.assets', tags: ['asset'], entities: [], conf: 1, created: t, updated: t, ver: 1,
      why: 'Added by user.', stale: { flag: false, reason: '' }, mergedFrom: [], aliases: [],
      meta: { kind: mime || 'link', dataUrl: dataUrl || '', size: size || 0 }
    };
    PO.store.log('asset', 'Asset ' + id + ' added.', id);
    PO.store.touch(); PO.store.persist(); ui.render();
    ui.toast('Asset added.', 'ok');
  }
  function assetPreview(a) {
    var m = (a.meta || {}), du = m.dataUrl || '';
    if (du && (m.kind || '').indexOf('image') === 0) return '<img src="' + du + '" alt="' + U.esc(a.title) + '">';
    if (du && (m.kind || '').indexOf('pdf') >= 0) return '<div style="text-align:center;font-size:40px">📕</div><div class="tiny" style="text-align:center"><a href="' + du + '" target="_blank">open PDF</a></div>';
    if (du) return '<div style="text-align:center;font-size:40px">📎</div><div class="tiny" style="text-align:center"><a href="' + du + '" target="_blank">open</a></div>';
    return '<div style="text-align:center;font-size:40px">🔗</div><div class="tiny dim" style="text-align:center;overflow-wrap:anywhere">' + U.esc(a.text || '').slice(0, 80) + '</div>';
  }
  function assetModal(W, ui, id) {
    var a = W.nodes[id];
    if (!a) return;
    var refs = PO.analyze.backlinks(W, id).concat(PO.analyze.forwardLinks(W, id));
    ui.modal('<h2>🖼 ' + U.esc(a.title) + '</h2>',
      assetPreview(a) +
      '<dl class="kv" style="margin-top:10px"><dt>ID</dt><dd class="mono">' + U.esc(a.id) + '</dd>' +
      '<dt>Kind</dt><dd>' + U.esc((a.meta && a.meta.kind) || 'link') + '</dd>' +
      '<dt>Size</dt><dd>' + ((a.meta && a.meta.size) ? U.fmtNum(a.meta.size) + ' bytes' : '—') + '</dd>' +
      '<dt>Usage</dt><dd>' + (refs.length ? refs.map(function (e) {
        var o = W.nodes[e.a === id ? e.b : e.a];
        return o ? '<a href="#/node/' + U.esc(o.id) + '">' + U.esc(o.title) + '</a>' : '?';
      }).join('<br>') : 'not referenced yet — link it from a feature or doc') + '</dd></dl>',
      [{ label: 'Close' }, { label: 'Open in Node view', onClick: function () { ui.closeModal(); ui.select(id, 'assets'); ui.setTab('node'); } }]);
  }
})();
