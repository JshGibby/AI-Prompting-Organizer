/* ============================================================
   Prompt Organizer — graph.js
   Dependency-free SVG relationship graph: layered layout,
   filter, pan/zoom, drag-to-reparent, click-to-select. Also
   mind-map and timeline renderers.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  var TYPE_COLORS = {
    topic: '#5aa2ff', feature: '#3fd68c', mechanic: '#ffb454', rule: '#ff6b6b',
    idea: '#e8c547', script: '#c792ea', asset: '#6fd3e7', document: '#9aa7bd',
    prompt: '#8f6bff', test: '#7ee081', requirement: '#ff8ab1', folder: '#546178'
  };
  var REL_COLORS = {
    partof: '#3a4a66', dependsOn: '#ffbf4d', implements: '#3fd68c', requires: '#ff8ab1',
    references: '#5aa2ff', updates: '#c792ea', conflictsWith: '#ff6b6b',
    exampleOf: '#9aa7bd', relatedTo: '#546178'
  };

  function filteredGraph(W, f) {
    f = f || {};
    var nodes = PO.analyze.nodesArr(W).filter(function (n) {
      if (f.hideFolders && n.type === 'folder') return false;
      if (f.type && f.type !== 'any' && n.type !== f.type) return false;
      if (f.status && f.status !== 'any' && n.status !== f.status) return false;
      if (f.tag && (n.tags || []).indexOf(f.tag) < 0) return false;
      if (f.confMin != null && (n.conf || 0) < f.confMin) return false;
      if (f.q && (U.normalize(n.title + ' ' + n.text).indexOf(U.normalize(f.q)) < 0)) return false;
      return true;
    });
    var keep = {};
    nodes.forEach(function (n) { keep[n.id] = 1; });
    if (f.focus) {
      // focus mode: show focus + 2-hop neighborhood
      var seen = {}, frontier = [f.focus];
      seen[f.focus] = 1;
      for (var hop = 0; hop < 2; hop++) {
        var next = [];
        W.edges.forEach(function (e) {
          if (seen[e.a] && !seen[e.b]) { seen[e.b] = 1; next.push(e.b); }
          if (seen[e.b] && !seen[e.a]) { seen[e.a] = 1; next.push(e.a); }
        });
        frontier = next;
      }
      nodes = nodes.filter(function (n) { return seen[n.id]; });
      keep = seen;
    }
    var edges = W.edges.filter(function (e) {
      if (!keep[e.a] || !keep[e.b]) return false;
      if (f.rel && f.rel !== 'any' && e.rel !== f.rel) return false;
      return true;
    });
    return { nodes: nodes.slice(0, 260), edges: edges.slice(0, 600) };
  }

  function layout(W, g, w, h) {
    // layered by tree depth; spread within layer; small force-relax on x.
    var layers = {};
    g.nodes.forEach(function (n) {
      var d = PO.analyze.depthOf(W, n.id);
      (layers[d] = layers[d] || []).push(n);
    });
    var depths = Object.keys(layers).map(Number).sort(function (a, b) { return a - b; });
    var pos = {};
    var lh = depths.length > 1 ? (h - 120) / (depths.length - 1) : 0;
    depths.forEach(function (d, li) {
      var arr = layers[d];
      arr.forEach(function (n, i) {
        var x = arr.length > 1 ? 90 + (w - 180) * (i / (arr.length - 1)) : w / 2;
        pos[n.id] = { x: x, y: 60 + li * lh };
      });
    });
    // relax: pull connected nodes toward each other's x
    for (var it = 0; it < 24; it++) {
      g.edges.forEach(function (e) {
        var a = pos[e.a], b = pos[e.b];
        if (!a || !b) return;
        var dx = (b.x - a.x) * 0.06;
        a.x += dx; b.x -= dx;
      });
    }
    Object.keys(pos).forEach(function (k) {
      pos[k].x = U.clamp(pos[k].x, 80, w - 80);
      pos[k].y = U.clamp(pos[k].y, 40, h - 40);
    });
    return pos;
  }

  function render(el, W, opts) {
    opts = opts || {};
    var w = Math.max(600, el.clientWidth || 800), h = opts.height || 520;
    var g = filteredGraph(W, opts.filter || {});
    var pos = layout(W, g, w, h);
    var sel = opts.selectedId;
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('id', 'graphSvg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('role', 'img');
    var defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10" fill="none" stroke="#5a6b88" stroke-width="1.6"/></marker>';
    svg.appendChild(defs);
    var root = document.createElementNS(NS, 'g');
    svg.appendChild(root);

    var edgeG = document.createElementNS(NS, 'g');
    root.appendChild(edgeG);
    g.edges.forEach(function (e) {
      var a = pos[e.a], b = pos[e.b];
      if (!a || !b) return;
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y);
      ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
      ln.setAttribute('class', 'gedge');
      ln.setAttribute('stroke', REL_COLORS[e.rel] || '#3a4a66');
      if (e.rel !== 'partof') ln.setAttribute('marker-end', 'url(#arr)');
      if (e.rel === 'conflictsWith') ln.setAttribute('stroke-dasharray', '5 3');
      ln.style.opacity = (sel && (e.a === sel || e.b === sel)) ? '1' : '0.55';
      var title = document.createElementNS(NS, 'title');
      title.textContent = e.a + ' —' + (PO.store.REL_LABEL[e.rel] || e.rel) + '→ ' + e.b + (e.note ? '\n' + e.note : '');
      ln.appendChild(title);
      edgeG.appendChild(ln);
    });

    var nodeG = document.createElementNS(NS, 'g');
    root.appendChild(nodeG);
    g.nodes.forEach(function (n) {
      var p = pos[n.id];
      var grp = document.createElementNS(NS, 'g');
      grp.setAttribute('class', 'gnode st-' + n.status + (n.id === sel ? ' sel' : ''));
      grp.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
      grp.dataset.nid = n.id;
      var label = (n.title || n.id).slice(0, 26);
      var bw = Math.max(64, label.length * 6.4 + 22);
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', -bw / 2); rect.setAttribute('y', -15);
      rect.setAttribute('width', bw); rect.setAttribute('height', 30);
      rect.setAttribute('rx', 8);
      rect.style.stroke = TYPE_COLORS[n.type] || '#33415a';
      grp.appendChild(rect);
      var tx = document.createElementNS(NS, 'text');
      tx.setAttribute('text-anchor', 'middle');
      tx.setAttribute('dy', '4');
      tx.textContent = label;
      grp.appendChild(tx);
      var badge = document.createElementNS(NS, 'circle');
      badge.setAttribute('cx', bw / 2 - 6); badge.setAttribute('cy', -15 + 6);
      badge.setAttribute('r', '4');
      badge.setAttribute('fill', TYPE_COLORS[n.type] || '#888');
      grp.appendChild(badge);
      if (n.stale && n.stale.flag) {
        var warn = document.createElementNS(NS, 'text');
        warn.setAttribute('x', -bw / 2 + 2); warn.setAttribute('y', -18);
        warn.setAttribute('font-size', '11');
        warn.textContent = '⚠';
        grp.appendChild(warn);
      }
      var tt = document.createElementNS(NS, 'title');
      tt.textContent = n.id + ' · ' + n.type + ' · ' + n.status + '\n' + (n.title || '');
      grp.appendChild(tt);
      nodeG.appendChild(grp);
    });

    el.innerHTML = '';
    el.appendChild(svg);

    // pan / zoom
    var scale = 1, tx0 = 0, ty0 = 0;
    function apply() { root.setAttribute('transform', 'translate(' + tx0 + ',' + ty0 + ') scale(' + scale + ')'); }
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var f = ev.deltaY < 0 ? 1.12 : 0.89;
      scale = U.clamp(scale * f, 0.3, 3);
      apply();
    }, { passive: false });
    var panning = null;
    svg.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.gnode')) return;
      panning = { x: ev.clientX, y: ev.clientY, tx: tx0, ty: ty0 };
      svg.setPointerCapture(ev.pointerId);
    });
    svg.addEventListener('pointermove', function (ev) {
      if (!panning) return;
      tx0 = panning.tx + (ev.clientX - panning.x);
      ty0 = panning.ty + (ev.clientY - panning.y);
      apply();
    });
    svg.addEventListener('pointerup', function () { panning = null; });

    // click select + drag-to-reparent
    var drag = null;
    nodeG.querySelectorAll('.gnode').forEach(function (grp) {
      grp.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        drag = { id: grp.dataset.nid, x0: ev.clientX, y0: ev.clientY, moved: false, el: grp };
        grp.setPointerCapture(ev.pointerId);
      });
      grp.addEventListener('pointermove', function (ev) {
        if (!drag || drag.id !== grp.dataset.nid) return;
        if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 6) drag.moved = true;
      });
      grp.addEventListener('pointerup', function (ev) {
        if (!drag || drag.id !== grp.dataset.nid) return;
        var d = drag; drag = null;
        if (!d.moved) { if (opts.onSelect) opts.onSelect(d.id); return; }
        // drop target: element under pointer
        grp.releasePointerCapture && grp.releasePointerCapture(ev.pointerId);
        var under = document.elementFromPoint(ev.clientX, ev.clientY);
        var tgt = under && under.closest ? under.closest('.gnode') : null;
        if (tgt && tgt.dataset.nid !== d.id && opts.onReparent) opts.onReparent(d.id, tgt.dataset.nid);
        else if (opts.onSelect) opts.onSelect(d.id);
      });
    });
    return { svg: svg, graph: g, reset: function () { scale = 1; tx0 = 0; ty0 = 0; apply(); } };
  }

  /* ---------- mind map (radial around a root) ---------- */
  function renderMindmap(el, W, rootId) {
    var root = W.nodes[rootId] || W.nodes['folder.root'];
    if (!root) { el.innerHTML = '<div class="empty">No nodes yet.</div>'; return; }
    var NS = 'http://www.w3.org/2000/svg';
    var w = Math.max(600, el.clientWidth || 800), h = 480, cx = w / 2, cy = h / 2;
    var kids = PO.analyze.childrenOf(W, root.id).slice(0, 14);
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.style.cssText = 'width:100%;height:480px;background:#0b0e13;border:1px solid var(--line);border-radius:10px';
    function node(x, y, label, color, id) {
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'gnode');
      if (id) {
        g.style.cursor = 'pointer';
        g.addEventListener('click', function () { if (PO.ui) PO.ui.select(id, 'mindmap'); });
      }
      var bw = Math.max(70, label.slice(0, 24).length * 6.4 + 22);
      var r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x - bw / 2); r.setAttribute('y', y - 15);
      r.setAttribute('width', bw); r.setAttribute('height', 30);
      r.setAttribute('rx', 15);
      r.style.stroke = color;
      g.appendChild(r);
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y + 4);
      t.setAttribute('text-anchor', 'middle');
      t.textContent = label.slice(0, 24);
      g.appendChild(t);
      svg.appendChild(g);
    }
    kids.forEach(function (k, i) {
      var a = (i / Math.max(1, kids.length)) * Math.PI * 2 - Math.PI / 2;
      var x = cx + Math.cos(a) * (w / 2 - 130), y = cy + Math.sin(a) * (h / 2 - 70);
      var ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', cx); ln.setAttribute('y1', cy);
      ln.setAttribute('x2', x); ln.setAttribute('y2', y);
      ln.setAttribute('stroke', '#3a4a66');
      svg.appendChild(ln);
      node(x, y, k.title || k.id, TYPE_COLORS[k.type] || '#888', k.id);
      // grandchildren (up to 3)
      PO.analyze.childrenOf(W, k.id).slice(0, 3).forEach(function (gk, j) {
        var gx = x + Math.cos(a) * 0 + (j - 1) * 0, gy = y + 34 + j * 30;
        var l2 = document.createElementNS(NS, 'line');
        l2.setAttribute('x1', x); l2.setAttribute('y1', y + 15);
        l2.setAttribute('x2', gx); l2.setAttribute('y2', gy);
        l2.setAttribute('stroke', '#2a3446');
        svg.appendChild(l2);
        node(gx, gy, gk.title || gk.id, '#546178', gk.id);
      });
    });
    node(cx, cy, root.title || root.id, '#5aa2ff', root.id);
    el.innerHTML = '';
    el.appendChild(svg);
  }

  /* ---------- timeline ---------- */
  function renderTimeline(el, W) {
    var evs = [];
    W.versions.slice(0, 80).forEach(function (v) { evs.push({ at: v.at, label: v.kind + ': ' + v.summary, id: v.nodeId }); });
    W.runs.slice(0, 20).forEach(function (r) { evs.push({ at: r.at, label: 'test run: ' + r.passed + '/' + r.total + ' passed (' + r.model + ')', id: null }); });
    evs.sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    if (!evs.length) { el.innerHTML = '<div class="empty">No history yet.</div>'; return; }
    el.innerHTML = '<div class="timeline">' + evs.map(function (e) {
      return '<div class="tl-ev"><div class="small">' + U.esc(e.label) + '</div>' +
        '<div class="tiny dim">' + U.fmtDate(e.at) + (e.id ? ' · <a href="#/node/' + U.esc(e.id) + '">' + U.esc(e.id) + '</a>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  PO.graph = {
    TYPE_COLORS: TYPE_COLORS, REL_COLORS: REL_COLORS,
    render: render, renderMindmap: renderMindmap, renderTimeline: renderTimeline,
    filteredGraph: filteredGraph
  };
})();
