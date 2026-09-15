/* ============================================================
   Prompt Organizer — ui-tabs-a.js
   Main tabs: Prompts, Review Queue, Dashboard, Search,
   Versions, Traceability, Recompile.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  function subbar(ui, key, subs) {
    return '<div class="subtabs">' + subs.map(function (s) {
      return '<button class="subtab" data-sub="' + s[0] + '" aria-selected="' + (ui.state.sub[key] === s[0]) + '">' + s[1] + '</button>';
    }).join('') + '</div>';
  }
  function wireSubbar(host, ui, key) {
    host.querySelectorAll('[data-sub]').forEach(function (b) {
      b.onclick = function () { ui.state.sub[key] = b.dataset.sub; ui.render(); };
    });
  }
  function nodeLink(n) {
    return '<a href="#/node/' + U.esc(n.id) + '">' + U.esc(n.title || n.id) + '</a> <span class="dim mono tiny">' + U.esc(n.id) + '</span>';
  }

  /* ================= PROMPTS ================= */
  PO.uiTabs.prompts = function (W, host, ui) {
    var sub = ui.state.sub.prompts;
    host.innerHTML = ui.tabHeadHTML(W, 'Prompts', 'Every import is versioned. New pastes update existing items instead of starting over.') +
      subbar(ui, 'prompts', [['list', '📝 Prompts'], ['lint', '🧹 Lint & tokens'], ['tpl', '📦 Templates · variables · snippets']]) +
      '<div id="pBody"></div>';
    ui.wireTabHead(host); wireSubbar(host, ui, 'prompts');
    var body = host.querySelector('#pBody');
    if (sub === 'list') promptsList(W, body, ui);
    else if (sub === 'lint') promptsLint(W, body, ui);
    else promptsTpl(W, body, ui);
  };

  function promptsList(W, host, ui) {
    var best = {};
    W.prompts.forEach(function (p) { var b = PO.tests.bestVersion(W, p.id); if (b) best[p.id] = b.version; });
    host.innerHTML = '<div class="toolbar"><button class="btn primary" id="pNew">＋ New prompt (N)</button>' +
      '<span class="small muted">' + W.prompts.length + ' prompt(s)</span></div>' +
      (W.prompts.length ? '' : '<div class="empty">No prompts yet. Import one to build your workspace.<br><br><button class="btn primary" id="pNew2">＋ Import prompt</button> <button class="btn" id="pSample">✨ Load sample</button></div>') +
      W.prompts.map(function (p) {
        var nodes = PO.analyze.nodesArr(W, true).filter(function (n) { return n.anchor && n.anchor.promptId === p.id; });
        return '<div class="card"><div class="row"><h3 style="flex:1;margin:0">📝 ' + U.esc(p.name) +
          (best[p.id] ? ' <span class="pill" title="Best version on your test cases">★ best: v' + best[p.id] + '</span>' : '') + '</h3>' +
          '<span class="pill">v' + p.vers.length + '</span></div>' +
          '<div class="small muted">' + U.wordsOf(p.text) + ' words · ~' + U.fmtNum(U.tokenEstimate(p.text)) + ' tokens · ' +
          U.readingTimeMin(p.text) + ' min read · ' + nodes.length + ' items · updated ' + U.fmtAgo(p.updated) + '</div>' +
          '<div class="quoteblock small">' + U.esc(p.text.slice(0, 280)) + (p.text.length > 280 ? '…' : '') + '</div>' +
          '<div class="row"><button class="btn sm" data-pview="' + U.esc(p.id) + '">View versions</button>' +
          '<button class="btn sm" data-padd="' + U.esc(p.id) + '">＋ Add version</button>' +
          '<button class="btn sm" data-plint="' + U.esc(p.id) + '">🧹 Lint</button>' +
          '<button class="btn sm danger" data-pdel="' + U.esc(p.id) + '">Delete</button></div>' +
          '<div id="pv-' + U.esc(p.id) + '"></div></div>';
      }).join('');
    function bind(id, fn) { var b = host.querySelector('#' + id); if (b) b.onclick = fn; }
    bind('pNew', ui.openNewPromptModal); bind('pNew2', ui.openNewPromptModal);
    bind('pSample', function () {
      var r = PO.ingest.ingestPrompt(W, 'Sample: Tiny RPG Spec', PO.app.samplePrompt(), {});
      PO.readme.regenerateAll(W); PO.store.touch(); PO.store.persist(); ui.render();
      ui.toast('Sample organized: ' + r.stats.created + ' items.', 'ok');
    });
    host.querySelectorAll('[data-pview]').forEach(function (b) {
      b.onclick = function () {
        var p = W.prompts.filter(function (x) { return x.id === b.dataset.pview; })[0];
        var box = host.querySelector('#pv-' + CSS.escape(p.id));
        box.innerHTML = '<hr><strong>Versions</strong>' + p.vers.slice().reverse().map(function (v, i, arr) {
          var prev = p.vers[p.vers.length - 1 - (arr.length - 1 - i) - 1];
          var diffBtn = prev ? ' <button class="btn sm ghost" data-vdiff="' + p.id + ':' + v.v + '">diff vs v' + (v.v - 1) + '</button>' : '';
          return '<div class="row small" style="padding:4px 0"><span class="pill">v' + v.v + '</span><span class="muted">' +
            U.fmtDate(v.at) + ' · ' + U.wordsOf(v.text) + ' words' + (v.note ? ' · ' + U.esc(v.note) : '') + '</span>' + diffBtn +
            ' <button class="btn sm ghost" data-vtext="' + p.id + ':' + v.v + '">text</button></div><div id="vbox-' + p.id + '-' + v.v + '"></div>';
        }).join('');
        box.querySelectorAll('[data-vtext]').forEach(function (t) {
          t.onclick = function () {
            var pid = t.dataset.vtext.split(':')[0], vv = +t.dataset.vtext.split(':')[1];
            var pp = W.prompts.filter(function (x) { return x.id === pid; })[0];
            var ver = pp.vers.filter(function (x) { return x.v === vv; })[0];
            document.getElementById('vbox-' + pid + '-' + vv).innerHTML = '<pre>' + U.esc(ver.text) + '</pre>';
          };
        });
        box.querySelectorAll('[data-vdiff]').forEach(function (t) {
          t.onclick = function () {
            var pid = t.dataset.vdiff.split(':')[0], vv = +t.dataset.vdiff.split(':')[1];
            var pp = W.prompts.filter(function (x) { return x.id === pid; })[0];
            var cur = pp.vers.filter(function (x) { return x.v === vv; })[0];
            var prv = pp.vers.filter(function (x) { return x.v === vv - 1; })[0];
            var ops = U.lineDiff(prv.text.split('\n'), cur.text.split('\n'));
            var s = U.diffSummary(ops);
            document.getElementById('vbox-' + pid + '-' + vv).innerHTML =
              '<div class="small muted">+' + s.add + ' / −' + s.del + ' lines</div><div class="card" style="background:#0b0e13">' + U.diffHTML(ops) + '</div>';
          };
        });
      };
    });
    host.querySelectorAll('[data-padd]').forEach(function (b) {
      b.onclick = function () {
        var p = W.prompts.filter(function (x) { return x.id === b.dataset.padd; })[0];
        ui.modal('<h2>＋ Add version to “' + U.esc(p.name) + '”</h2>',
          '<label class="small muted">New full text (matched against v' + p.vers.length + ' — only changes create churn)</label>' +
          '<textarea id="pavText" style="min-height:240px">' + U.esc(p.text) + '</textarea>',
          [{ label: 'Cancel' }, {
            label: 'Save as v' + (p.vers.length + 1), primary: true, onClick: function () {
              var r = PO.ingest.ingestPrompt(W, p.name, (U.$('pavText') || {}).value || '', { promptId: p.id, incremental: true });
              PO.readme.regenerateAll(W); PO.store.touch(); PO.store.persist();
              ui.closeModal(); ui.render();
              ui.toast('Saved v' + r.ver + ': ' + r.stats.created + ' new · ' + r.stats.updated + ' updated · ' + r.stats.merged + ' merged.', 'ok');
            }
          }]);
      };
    });
    host.querySelectorAll('[data-plint]').forEach(function (b) {
      b.onclick = function () { ui.state.sub.prompts = 'lint'; ui.state.promptSel = b.dataset.plint; ui.render(); };
    });
    host.querySelectorAll('[data-pdel]').forEach(function (b) {
      b.onclick = function () {
        var p = W.prompts.filter(function (x) { return x.id === b.dataset.pdel; })[0];
        ui.modal('<h2>Delete “' + U.esc(p.name) + '”?</h2>',
          '<p>Removes the prompt and its versions. Organized items stay (they carry their own source anchors), but traces will point at a deleted prompt. History is kept in the changelog.</p>',
          [{ label: 'Cancel' }, {
            label: 'Delete prompt', danger: true, onClick: function () {
              W.prompts = W.prompts.filter(function (x) { return x.id !== p.id; });
              PO.store.log('prompt-delete', 'Deleted prompt “' + p.name + '”.', null);
              PO.store.addVersion('prompt-delete', 'Deleted prompt ' + p.name, { promptId: p.id, before: p.text, after: '' });
              PO.store.touch(); PO.store.persist(); ui.closeModal(); ui.render();
            }
          }]);
      };
    });
  }

  function promptsLint(W, host, ui) {
    if (!W.prompts.length) { host.innerHTML = '<div class="empty">Import a prompt first.</div>'; return; }
    var pid = ui.state.promptSel || W.prompts[0].id;
    var p = W.prompts.filter(function (x) { return x.id === pid; })[0] || W.prompts[0];
    var ver = ui.state.promptVer || p.vers.length;
    var v = p.vers.filter(function (x) { return x.v === ver; })[0] || p.vers[p.vers.length - 1];
    var lint = PO.analyze.lintPrompt(v.text);
    var toks = U.tokenEstimate(v.text);
    var ctx = ui.state.lintCtx;
    var use = PO.analyze.contextUsage(toks, ctx);
    host.innerHTML =
      '<div class="toolbar"><select id="lPrompt" style="max-width:260px">' + W.prompts.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === p.id ? ' selected' : '') + '>' + U.esc(x.name) + '</option>';
      }).join('') + '</select>' +
      '<select id="lVer" style="max-width:120px">' + p.vers.map(function (x) {
        return '<option value="' + x.v + '"' + (x.v === v.v ? ' selected' : '') + '>v' + x.v + '</option>';
      }).join('') + '</select>' +
      '<select id="lCtx" style="max-width:180px" title="Context window">' + PO.analyze.CONTEXT_PRESETS.map(function (c) {
        return '<option value="' + c.ctx + '"' + (ctx === c.ctx ? ' selected' : '') + '>' + c.name + '</option>';
      }).join('') + '</select></div>' +
      '<div class="grid c4">' +
      '<div class="stat"><div class="v">' + U.fmtNum(toks) + '</div><div class="l">tokens (est)</div></div>' +
      '<div class="stat"><div class="v">' + use.pct + '%</div><div class="l">of context window</div><div class="progress"><i style="width:' + Math.min(100, use.pct) + '%"></i></div></div>' +
      '<div class="stat"><div class="v">' + lint.words + '</div><div class="l">words · ' + lint.paras + ' paras</div></div>' +
      '<div class="stat"><div class="v"><span class="bad-t">' + lint.counts.err + '</span> / <span class="warn-t">' + lint.counts.warn + '</span> / <span class="muted">' + lint.counts.info + '</span></div><div class="l">err / warn / info</div></div>' +
      '</div><div class="card"><h3>Lint — clarity · ambiguity · tone · readability · missing details</h3>' +
      (lint.issues.length ? lint.issues.map(function (i) {
        var sev = i.sev === 'err' ? 'bad-t' : (i.sev === 'warn' ? 'warn-t' : 'acc-t');
        return '<div class="lint-issue"><strong class="' + sev + '">● ' + i.sev.toUpperCase() + '</strong> <span class="pill">' + i.cat + '</span> ' +
          U.esc(i.msg) + '<div class="small muted">↳ ' + U.esc(i.fix) + '</div></div>';
      }).join('') : '<p class="ok-t">✓ No issues found. Clean prompt.</p>') + '</div>';
    host.querySelector('#lPrompt').onchange = function (e) { ui.state.promptSel = e.target.value; ui.state.promptVer = null; ui.render(); };
    host.querySelector('#lVer').onchange = function (e) { ui.state.promptVer = +e.target.value; ui.render(); };
    host.querySelector('#lCtx').onchange = function (e) { ui.state.lintCtx = +e.target.value; ui.render(); };
  }

  function promptsTpl(W, host, ui) {
    host.innerHTML = '<div class="two-col"><div>' +
      '<div class="card"><h3>📦 Templates</h3><div id="tList">' + W.templates.map(function (t, i) {
        return '<div class="row small" style="padding:4px 0"><strong style="flex:1">' + U.esc(t.name) + '</strong>' +
          '<button class="btn sm ghost" data-tuse="' + i + '">insert</button><button class="btn sm ghost" data-tdel="' + i + '">×</button></div>' +
          '<div class="tiny muted">' + U.esc((t.body || '').slice(0, 120)) + '…</div>';
      }).join('') + '</div><hr><input type="text" id="tName" placeholder="Template name"><p></p><textarea id="tBody" placeholder="Template body — use {{variables}}"></textarea>' +
      '<p></p><button class="btn sm primary" id="tAdd">Add template</button></div>' +
      '<div class="card"><h3>🧩 Snippet library</h3><div id="sList">' + W.snippets.map(function (t, i) {
        return '<div class="row small" style="padding:4px 0"><strong style="flex:1">' + U.esc(t.name) + '</strong>' +
          '<button class="btn sm ghost" data-scopy="' + i + '">copy</button><button class="btn sm ghost" data-sdel="' + i + '">×</button></div>';
      }).join('') + '</div><hr><input type="text" id="sName" placeholder="Snippet name"><p></p><textarea id="sBody" placeholder="Reusable pattern"></textarea>' +
      '<p></p><button class="btn sm primary" id="sAdd">Add snippet</button></div></div>' +
      '<div><div class="card"><h3>🔧 Variable manager</h3><p class="small muted">Variables like <code>{{game}}</code> in templates resolve to these values.</p>' +
      '<div id="vList">' + Object.keys(W.variables).map(function (k) {
        return '<div class="row" style="padding:3px 0"><code style="flex:1">{{' + U.esc(k) + '}} = ' + U.esc(W.variables[k]) + '</code><button class="btn sm ghost" data-vdel="' + U.esc(k) + '">×</button></div>';
      }).join('') + '</div><hr><div class="row"><input type="text" id="vK" placeholder="name" style="max-width:140px"><input type="text" id="vV" placeholder="value"><button class="btn sm primary" id="vAdd">Set</button></div></div>' +
      '<div class="card"><h3>Applies to…</h3><p class="small muted">Templates insert into the import box; snippets copy anywhere. Variables substitute on insert.</p></div>' +
      '</div></div>';
    function refresh() { PO.store.touch(); PO.store.persist(); ui.render(); }
    host.querySelector('#tAdd').onclick = function () {
      var n = host.querySelector('#tName').value.trim(), b = host.querySelector('#tBody').value;
      if (!n || !b) { ui.toast('Name and body required.', 'warn'); return; }
      W.templates.push({ name: n, body: b }); PO.store.log('template', 'Template “' + n + '” added.', null); refresh();
    };
    host.querySelectorAll('[data-tuse]').forEach(function (x) {
      x.onclick = function () {
        var t = W.templates[+x.dataset.tuse];
        var body = t.body.replace(/\{\{(\w+)\}\}/g, function (_, k) { return W.variables[k] != null ? W.variables[k] : '{{' + k + '}}'; });
        U.copyText(body, 'Template copied (variables resolved)');
      };
    });
    host.querySelectorAll('[data-tdel]').forEach(function (x) { x.onclick = function () { W.templates.splice(+x.dataset.tdel, 1); refresh(); }; });
    host.querySelector('#sAdd').onclick = function () {
      var n = host.querySelector('#sName').value.trim(), b = host.querySelector('#sBody').value;
      if (!n || !b) { ui.toast('Name and body required.', 'warn'); return; }
      W.snippets.push({ name: n, body: b }); refresh();
    };
    host.querySelectorAll('[data-scopy]').forEach(function (x) { x.onclick = function () { U.copyText(W.snippets[+x.dataset.scopy].body, 'Snippet copied'); }; });
    host.querySelectorAll('[data-sdel]').forEach(function (x) { x.onclick = function () { W.snippets.splice(+x.dataset.sdel, 1); refresh(); }; });
    host.querySelector('#vAdd').onclick = function () {
      var k = host.querySelector('#vK').value.trim(), v = host.querySelector('#vV').value;
      if (!k) return; W.variables[k] = v; refresh();
    };
    host.querySelectorAll('[data-vdel]').forEach(function (x) { x.onclick = function () { delete W.variables[x.dataset.vdel]; refresh(); }; });
  }

  /* ================= REVIEW QUEUE ================= */
  PO.uiTabs.review = function (W, host, ui) {
    var q = PO.analyze.reviewQueue(W);
    var f = ui.state.reviewFilter;
    var counts = {};
    q.forEach(function (it) { it.reasons.forEach(function (r) { counts[r.k] = (counts[r.k] || 0) + 1; }); });
    var chips = [['', 'all (' + q.length + ')'], ['uncertain', '❓ uncertain'], ['inferred', '🔮 inferred'], ['orphan', '🏝 orphans'],
      ['stale', '⚠ stale'], ['conflict', '⚔ conflicts'], ['dup', '⧉ duplicates'], ['merged', '⧉ merged'], ['lowconf', '📉 low-conf']];
    var list = f ? q.filter(function (it) { return it.reasons.some(function (r) { return r.k === f; }); }) : q;
    host.innerHTML = ui.tabHeadHTML(W, 'Review Queue', 'Sorted by severity × impact — spend attention where it matters most. Every action is logged.') +
      '<div class="chips" style="margin-bottom:10px">' + chips.map(function (c) {
        return '<button class="subtab" data-rf="' + c[0] + '" aria-selected="' + (f === c[0]) + '">' + c[1] + (counts[c[0]] ? ' (' + counts[c[0]] + ')' : '') + '</button>';
      }).join('') +
      (f && list.length ? '<button class="btn sm ok" id="rAcceptAll" style="margin-left:auto" title="Assert every item in the current filter">✓ Accept all ' + list.length + ' shown</button>' : '') +
      '</div><div id="rList">' +
      (list.length ? list.slice(0, 120).map(function (it, i) { return reviewItemHTML(W, it, i); }).join('') :
        '<div class="empty">✨ Queue is clear. Nothing needs review.</div>') + '</div>';
    ui.wireTabHead(host);
    host.querySelectorAll('[data-rf]').forEach(function (b) { b.onclick = function () { ui.state.reviewFilter = b.dataset.rf; ui.render(); }; });
    var aa = host.querySelector('#rAcceptAll');
    if (aa) aa.onclick = function () {
      var n = 0;
      list.forEach(function (it) {
        var x = it.node;
        if (x.status === 'uncertain' || x.status === 'inferred') { x.status = 'asserted'; x.conf = Math.max(x.conf || 0, 0.8); n++; }
        if (x.stale && x.stale.flag) { x.stale = { flag: false, reason: '' }; n++; }
      });
      if (n) {
        PO.store.log('review-accept', 'Bulk accepted ' + n + ' filtered item(s).', null);
        PO.store.touch(); PO.store.persist();
      }
      ui.render();
      ui.toast('Accepted ' + n + ' item(s).', n ? 'ok' : 'warn');
    };
    wireReviewActions(W, host, ui, list);
  };
  function reviewItemHTML(W, it, i) {
    var n = it.node;
    var why = it.reasons.map(function (r) { return r.label; }).join(' · ');
    return '<div class="rev-item ' + (it.topSev === 'high' ? 'high' : it.topSev === 'med' ? 'med' : 'low') + '">' +
      '<div class="row"><span style="font-size:16px">' + PO.ui.typeIcon(n.type) + '</span>' +
      '<strong style="flex:1">' + U.esc(n.title) + '</strong>' +
      '<span class="pill">impact ' + it.impact + '</span>' + PO.ui.statusPill(n) + '</div>' +
      '<div class="small muted">' + U.esc(why) + ' · <span class="mono">' + U.esc(n.id) + '</span></div>' +
      '<div class="small">' + U.esc((n.text || '').slice(0, 220)) + ((n.text || '').length > 220 ? '…' : '') + '</div>' +
      (it.pair ? '<div class="small warn-t">↔ possible duplicate: <a href="#/node/' + U.esc(it.pair.id) + '">' + U.esc(it.pair.title) + '</a> <span class="dim mono">' + U.esc(it.pair.id) + '</span></div>' : '') +
      '<div class="rev-actions" data-ri="' + i + '">' +
      '<button class="btn sm ok" data-act="accept">✓ Accept</button>' +
      '<button class="btn sm" data-act="edit">✎ Edit</button>' +
      '<button class="btn sm" data-act="why">? Why here</button>' +
      (n.status === 'inferred' ? '<button class="btn sm" data-act="revert">↩ Revert</button>' : '') +
      '<button class="btn sm" data-act="reparent">⇄ Re-parent</button>' +
      (it.pair ? '<button class="btn sm" data-act="merge">⧉ Merge with ' + U.esc(it.pair.id) + '</button>' : '') +
      '<button class="btn sm" data-act="open">Open →</button>' +
      '<button class="btn sm danger" data-act="reject">✕ Reject</button>' +
      '</div></div>';
  }
  function wireReviewActions(W, host, ui, list) {
    host.querySelectorAll('[data-ri]').forEach(function (box) {
      var it = list[+box.dataset.ri];
      if (!it) return;
      var n = it.node;
      box.querySelectorAll('[data-act]').forEach(function (b) {
        b.onclick = function () {
          var act = b.dataset.act;
          if (act === 'open') { ui.select(n.id, 'review'); ui.setTab('node'); }
          else if (act === 'edit') ui.openNodeEditModal(n.id);
          else if (act === 'why') {
            var parent = n.parent && W.nodes[n.parent] ? W.nodes[n.parent] : null;
            var sibs = parent ? PO.analyze.childrenOf(W, parent.id).filter(function (s) { return s.id !== n.id; }).slice(0, 6) : [];
            var dupQ = it.pair ? '<dt>Possible duplicate</dt><dd><a href="#/node/' + U.esc(it.pair.id) + '">' + U.esc(it.pair.title) + '</a> <span class="mono tiny">' + U.esc(it.pair.id) + '</span></dd>' : '';
            ui.modal('<h2>Why is “' + U.esc(n.title) + '” here?</h2>',
              '<dl class="kv"><dt>Status</dt><dd>' + PO.ui.statusPill(n) + '</dd>' +
              '<dt>Reasoning</dt><dd>' + U.esc(n.why || '—') + '</dd>' +
              '<dt>Confidence</dt><dd>' + Math.round((n.conf || 0) * 100) + '%</dd>' +
              '<dt>Placed in</dt><dd>' + (parent ? U.esc(parent.title) + ' <span class="mono tiny">' + U.esc(parent.id) + '</span>' : '—') + '</dd>' +
              (sibs.length ? '<dt>Neighbor items</dt><dd>' + sibs.map(function (s) { return '<a href="#/node/' + U.esc(s.id) + '">' + U.esc(s.title) + '</a>'; }).join(' · ') + '</dd>' : '') +
              dupQ +
              '<dt>Source quote</dt><dd><div class="quoteblock">' + U.esc(n.quote || '(none)') + '</div></dd>' +
              '<dt>Anchor</dt><dd class="mono small">' + (n.anchor ? U.esc(n.anchor.promptId + ' v' + n.anchor.ver + ' [' + n.anchor.start + '–' + n.anchor.end + ']') : '—') + '</dd></dl>');
          }
          else if (act === 'accept') {
            if (n.status === 'uncertain' || n.status === 'inferred') { n.status = 'asserted'; n.conf = Math.max(n.conf || 0, 0.8); }
            if (n.stale) n.stale = { flag: false, reason: '' };
            n.updated = U.nowISO();
            PO.store.log('review-accept', 'Accepted ' + n.id + '.', n.id);
            PO.store.touch(); PO.store.persist(); ui.render();
            ui.toast('Accepted ' + U.esc(n.id), 'ok');
          }
          else if (act === 'revert') {
            // revert inferred node: move to inbox as uncertain
            n.status = 'uncertain'; n.parent = 'folder.inbox';
            PO.store.log('review-revert', 'Reverted inferred item ' + n.id + ' to inbox.', n.id);
            PO.readme.touchParents(W, 'folder.inbox');
            PO.store.touch(); PO.store.persist(); ui.render();
          }
          else if (act === 'reparent') {
            var folders = PO.analyze.nodesArr(W).filter(function (x) { return x.type === 'folder' || x.type === 'topic'; });
            ui.modal('<h2>Re-parent ' + U.esc(n.id) + '</h2>',
              '<select id="rpSel">' + folders.map(function (x) {
                return '<option value="' + U.esc(x.id) + '"' + (n.parent === x.id ? ' selected' : '') + '>' + U.esc(x.title + ' (' + x.id + ')') + '</option>';
              }).join('') + '</select>',
              [{ label: 'Cancel' }, {
                label: 'Move', primary: true, onClick: function () {
                  ui.closeModal();
                  ui.reparentNode(W, n.id, (U.$('rpSel') || {}).value);
                  PO.store.persist();
                }
              }]);
          }
          else if (act === 'merge' && it.pair) {
            var keep = (n.text || '').length >= ((it.pair.text || '').length) ? n.id : it.pair.id;
            var drop = keep === n.id ? it.pair.id : n.id;
            PO.ingest.mergeNodes(W, keep, drop, 'human-confirmed review merge');
            PO.store.touch(); PO.store.persist(); ui.render();
            ui.toast('Merged — kept ' + U.esc(keep), 'ok');
          }
          else if (act === 'reject') {
            ui.modal('<h2>Reject ' + U.esc(n.id) + '?</h2>',
              '<p>Deletes this item (its merged history is kept in the changelog). Blocked if other items depend on it — re-link them first.</p>',
              [{ label: 'Cancel' }, {
                label: 'Delete', danger: true, onClick: function () {
                  var deps = PO.analyze.impactOf(W, n.id);
                  if (deps.length) { ui.toast('Blocked: ' + deps.length + ' item(s) depend on it.', 'bad'); return; }
                  W.edges = W.edges.filter(function (e) { return e.a !== n.id && e.b !== n.id; });
                  delete W.nodes[n.id];
                  PO.store.log('review-reject', 'Rejected/deleted ' + n.id + ' (“' + n.title + '”).', null);
                  PO.store.addVersion('delete', 'Deleted ' + n.id, { nodeId: n.id, before: n.text, after: '' });
                  PO.readme.touchParents(W, n.parent || 'folder.root');
                  PO.store.touch(); PO.store.persist(); ui.closeModal(); ui.render();
                }
              }]);
          }
        };
      });
    });
  }

  /* ================= DASHBOARD ================= */
  PO.uiTabs.dashboard = function (W, host, ui) {
    var A = PO.analyze, st = A.stats(W), h = A.health(W), cov = A.coverage(W);
    var typeCells = Object.keys(st.byType).map(function (t) {
      return '<div class="stat clickable" data-tf="' + t + '" title="Show all ' + t + 's in the Tree"><div class="v">' + st.byType[t] + '</div><div class="l">' + ui.typeIcon(t) + ' ' + t + 's →</div></div>';
    }).join('');
    var ai = null;
    try { ai = PO.ai.usageSummary(); } catch (e) { ai = null; }
    host.innerHTML = ui.tabHeadHTML(W, 'Dashboard', 'The prompt at a glance — and where more work is needed.') +
      '<div class="grid c4">' +
      '<div class="stat"><div class="v">' + U.fmtNum(st.words) + '</div><div class="l">words · ' + U.fmtNum(st.chars) + ' chars</div></div>' +
      '<div class="stat"><div class="v">~' + U.fmtNum(st.tokens) + '</div><div class="l">tokens · ' + st.readingMin + ' min read</div></div>' +
      '<div class="stat"><div class="v">' + st.nodes + '</div><div class="l">items · depth ' + st.maxDepth + '</div></div>' +
      '<div class="stat"><div class="v">' + st.edges + '</div><div class="l">connections</div></div>' +
      '</div><p></p><div class="grid c4">' +
      attCell(ui, 'uncertain', st.uncertain, 'uncertain') + attCell(ui, 'orphan', st.orphans, 'orphaned') +
      attCell(ui, 'stale', st.stale, 'stale') + attCell(ui, 'conflict', st.conflicts, 'conflicts') +
      '</div><p></p><div class="grid c4">' + typeCells + '</div>' +
      '<div class="two-col"><div>' +
      '<div class="card"><h3>Workspace health</h3><div class="health-ring"><div class="health-num ' +
      (h.score >= 75 ? 'ok-t' : h.score >= 50 ? 'warn-t' : 'bad-t') + '">' + h.score + '</div>' +
      '<div class="health-factors">' + h.factors.map(function (f) {
        var col = f.score >= 0.75 ? 'var(--ok)' : f.score >= 0.45 ? 'var(--warn)' : 'var(--bad)';
        return '<div class="hf"><span style="flex:0 0 150px">' + U.esc(f.label) + '</span><span class="bar"><i style="width:' + Math.round(f.score * 100) + '%;background:' + col + '"></i></span>' +
          (f.filter ? '<button data-hf="' + f.filter + '">' + U.esc(f.value) + ' →</button>' : '<span class="dim">' + U.esc(f.value) + '</span>') + '</div>';
      }).join('') + '</div></div></div>' +
      '<div class="card"><h3>Coverage by topic</h3>' +
      (A.coverageByTopic(W).map(function (c) {
        return '<div class="hf"><span style="flex:0 0 170px" class="small">' + U.esc(c.topic.title) + '</span>' +
          '<span class="bar"><i style="width:' + c.cov + '%;background:' + (c.cov >= 80 ? 'var(--ok)' : c.cov >= 50 ? 'var(--warn)' : 'var(--bad)') + '"></i></span>' +
          '<span class="tiny dim">' + c.cov + '% · ' + c.reqs + ' reqs</span></div>';
      }).join('') || '<p class="muted small">No topics yet.</p>') +
      '<p class="small muted">Overall requirement coverage: <strong>' + cov.pct + '%</strong> (' + cov.covered + '/' + cov.total + ')</p></div>' +
      '<div><div class="card"><h3>Workspace meta</h3>' +
      '<p class="small muted">Duplicates merged: ' + st.merged + ' · Avg confidence: ' + Math.round(st.avgConf * 100) + '% · Versions: ' + st.versions +
      '<br>Export size: ~' + U.fmtNum(st.exportBytes) + ' chars JSON</p></div>' +
      '<div class="card"><h3>Recent changes</h3>' + W.changelog.slice(0, 8).map(function (c) {
        return '<div class="small" style="padding:3px 0"><span class="dim">' + U.fmtAgo(c.at) + '</span> <strong>' + U.esc(c.action) + '</strong> — ' + U.esc((c.detail || '').slice(0, 120)) + '</div>';
      }).join('') + '<button class="btn sm ghost" data-goto data-tab="versions">full history →</button></div>' +
      '<div class="card"><h3>🤖 AI efficiency</h3>' +
      (ai ? '<div class="row" style="gap:14px"><div><div class="stat" style="border:none;background:transparent;padding:2px"><div class="v">' + ai.todayMsgs + '</div><div class="l">messages today</div></div></div>' +
        '<div><div class="stat" style="border:none;background:transparent;padding:2px"><div class="v">~' + U.fmtNum(ai.todayTok) + '</div><div class="l">tokens today</div></div></div>' +
        '<div><div class="stat" style="border:none;background:transparent;padding:2px"><div class="v">' + ai.weekMsgs + '</div><div class="l">this week</div></div></div></div>' +
        '<p class="tiny muted">Counted locally in this browser. Free-tier quotas per model live in the chat\'s ⚙ AI settings.</p>' :
        '<p class="small muted">No AI usage tracked yet — open 💬 AI Chat to start. Everything else works offline.</p>') +
      '<div class="row"><button class="btn sm primary" data-goto data-tab="chat">💬 Ask the AI</button></div></div>' +
      '<div class="card"><h3>Quick actions</h3><div class="row"><button class="btn sm primary" id="dNew">＋ Prompt</button>' +
      '<button class="btn sm" data-goto data-tab="recompile">🧩 Recompile</button>' +
      '<button class="btn sm" data-goto data-tab="review">🛎 Review</button>' +
      '<button class="btn sm" id="dSnap">⤓ Snapshot</button></div></div>' +
      '</div></div>';
    ui.wireTabHead(host);
    host.querySelectorAll('[data-hf]').forEach(function (b) {
      b.onclick = function () { ui.state.reviewFilter = b.dataset.hf === 'reqs' ? '' : b.dataset.hf; ui.setTab(b.dataset.hf === 'reqs' ? 'trace' : 'review'); };
    });
    host.querySelectorAll('[data-tf]').forEach(function (b) {
      b.onclick = function () { ui.state.filters.type = b.dataset.tf; ui.setTab('tree'); };
    });
    host.querySelectorAll('[data-att]').forEach(function (b) {
      b.onclick = function () { ui.state.reviewFilter = b.dataset.att; ui.setTab('review'); };
    });
    var dn = host.querySelector('#dNew'); if (dn) dn.onclick = ui.openNewPromptModal;
    var ds = host.querySelector('#dSnap'); if (ds) ds.onclick = PO.snapshot.downloadSnapshot;
    function attCell(ui, f, v, l) {
      return '<div class="stat clickable" data-att="' + f + '"><div class="v">' + v + '</div><div class="l">' + l + ' →</div></div>';
    }
  };

  /* ================= SEARCH ================= */
  PO.uiTabs.search = function (W, host, ui) {
    var sub = ui.state.sub.search;
    host.innerHTML = ui.tabHeadHTML(W, 'Search', 'Full-text + tag / type / confidence / date / source filters, with graph expansion.') +
      subbar(ui, 'search', [['search', '🔎 Search'], ['qa', '💬 Q&A'], ['saved', '⭐ Saved queries']]) +
      '<div id="sBody"></div>';
    ui.wireTabHead(host); wireSubbar(host, ui, 'search');
    var body = host.querySelector('#sBody');
    if (sub === 'search') searchMain(W, body, ui);
    else if (sub === 'qa') searchQA(W, body, ui);
    else searchSaved(W, body, ui);
  };
  function searchMain(W, host, ui) {
    var f = ui.state.filters;
    host.innerHTML = ui.filterBarHTML(W, {
      extra: '<select id="fConf" title="Min confidence"><option value="0">any conf</option>' +
        [0.5, 0.7, 0.85].map(function (c) { return '<option value="' + c + '"' + (+f.confMin === c ? ' selected' : '') + '>≥' + Math.round(c * 100) + '%</option>'; }).join('') + '</select>' +
        '<select id="fSrc" title="Source prompt"><option value="">any source</option>' + W.prompts.map(function (p) {
          return '<option value="' + p.id + '"' + (f.source === p.id ? ' selected' : '') + '>' + U.esc(p.name) + '</option>';
        }).join('') + '</select>' +
        '<button class="btn sm" id="fSaveQ">⭐ save</button>'
    }) + '<div id="sRes"></div>';
    ui.wireFilterBar(host, function () { draw(); });
    var fBar = host.querySelector('.card .toolbar');
    if (fBar) fBar.title = 'Filters carry across tabs — press clear to reset all.';
    host.querySelector('#fConf').onchange = function (e) { f.confMin = +e.target.value; draw(); };
    host.querySelector('#fSrc').onchange = function (e) { f.source = e.target.value; draw(); };
    host.querySelector('#fSaveQ').onclick = function () {
      var name = prompt('Name this query:', f.q || 'untitled');
      if (!name) return;
      W.queries.push({ name: name, q: f.q, type: f.type, status: f.status, tag: f.tag, confMin: f.confMin, source: f.source || '' });
      PO.store.touch(); PO.store.persist(); ui.render(); ui.toast('Query saved.', 'ok');
    };
    function draw() {
      var res = PO.analyze.expandWithNeighbors(W, PO.analyze.searchNodes(W, f.q, f));
      var box = host.querySelector('#sRes');
      var sel = ui.state.nodeId && W.nodes[ui.state.nodeId];
      var active = [];
      if (f.q) active.push('text “' + U.esc(f.q) + '”');
      if (f.type !== 'any') active.push('type: ' + f.type);
      if (f.status !== 'any') active.push('status: ' + f.status);
      if (f.tag) active.push('tag #' + U.esc(f.tag));
      if (f.confMin) active.push('conf ≥' + Math.round(f.confMin * 100) + '%');
      if (f.source) { var sp = W.prompts.filter(function (x) { return x.id === f.source; })[0]; active.push('source: ' + (sp ? U.esc(sp.name) : '?')); }
      box.innerHTML = (active.length ? '<div class="small muted" style="margin-bottom:8px">🔎 Filtering by: ' + active.map(function (a) { return '<span class="pill">' + a + '</span>'; }).join(' ') +
        '</div>' : '') + '<div class="two-col"><div><div class="card"><h3>' + res.length + ' result(s)' + (f.q ? ' for “' + U.esc(f.q) + '”' : '') + '</h3>' +
        (res.slice(0, 80).map(function (r) {
          return '<div class="search-hit" data-hit="' + U.esc(r.node.id) + '"><div class="row">' + ui.typeIcon(r.node.type) + ' <strong>' + U.highlight(r.node.title, f.q) + '</strong>' +
            (r.neighbor ? '<span class="pill">neighbor</span>' : '') + '<span class="flex-spacer"></span>' + ui.statusPill(r.node) + '</div>' +
            '<div class="small muted">' + U.highlight((r.node.text || '').slice(0, 160), f.q) + '</div></div>';
        }).join('') || '<div class="empty">No matches. Try fewer words or clear filters.</div>') + '</div></div>' +
        '<div><div class="card"><h3>Backlinks / forward links' + (sel ? ' — ' + U.esc(sel.id) : '') + '</h3>' + linksPanel(W, ui) + '</div>' +
        '<div class="card"><h3>Outline / TOC</h3>' + outlineHTML(W, ui) + '</div>' +
        '<div class="card"><h3>Recent · favorites · history</h3>' + recentHTML(W, ui) + '</div></div></div>';
      box.querySelectorAll('[data-hit]').forEach(function (h) { h.onclick = function () { ui.select(h.dataset.hit, 'search'); }; });
      box.querySelectorAll('[data-fav]').forEach(function (b) {
        b.onclick = function () {
          var id = b.dataset.fav;
          var i = W.favorites.indexOf(id);
          if (i >= 0) W.favorites.splice(i, 1); else W.favorites.push(id);
          PO.store.touch(); PO.store.persist(); draw();
        };
      });
      box.querySelectorAll('[data-open]').forEach(function (b) { b.onclick = function () { ui.select(b.dataset.open, 'search'); }; });
    }
    draw();
  }
  function linksPanel(W, ui) {
    var sel = ui.state.nodeId && W.nodes[ui.state.nodeId];
    if (!sel) return '<p class="muted small">Select a node to see its links.</p>';
    var back = PO.analyze.backlinks(W, sel.id), fwd = PO.analyze.forwardLinks(W, sel.id);
    function rows(es, dir) {
      return es.map(function (e) {
        var o = W.nodes[dir === 'in' ? e.a : e.b];
        if (!o) return '';
        return '<div class="small" style="padding:2px 0">' + (dir === 'in' ? '←' : '→') + ' <span class="pill">' + (PO.store.REL_LABEL[e.rel] || e.rel) + '</span> ' +
          '<a href="#/node/' + U.esc(o.id) + '">' + U.esc(o.title) + '</a></div>';
      }).join('');
    }
    return '<div class="small muted">← backlinks (' + back.length + ')</div>' + (rows(back, 'in') || '<div class="tiny dim">none</div>') +
      '<div class="small muted" style="margin-top:6px">→ forward links (' + fwd.length + ')</div>' + (rows(fwd, 'out') || '<div class="tiny dim">none</div>');
  }
  function outlineHTML(W, ui) {
    var heads = [];
    W.prompts.forEach(function (p) {
      p.text.split('\n').forEach(function (ln) {
        var m = ln.match(/^(#{1,4})\s+(.*)/);
        if (m) heads.push({ level: m[1].length, text: m[2], prompt: p.name });
      });
    });
    if (!heads.length) return '<p class="muted small">No headings found in prompts.</p>';
    return '<div style="max-height:220px;overflow:auto">' + heads.slice(0, 60).map(function (h) {
      return '<div class="small" style="padding-left:' + (h.level - 1) * 14 + 'px">§ ' + U.esc(h.text) + ' <span class="dim tiny">(' + U.esc(h.prompt) + ')</span></div>';
    }).join('') + '</div>';
  }
  function recentHTML(W, ui) {
    function items(ids, emptyMsg) {
      if (!ids.length) return '<div class="tiny dim">' + emptyMsg + '</div>';
      return ids.slice(0, 8).map(function (id) {
        var n = W.nodes[id];
        if (!n) return '';
        var fav = W.favorites.indexOf(id) >= 0 ? '★' : '☆';
        return '<div class="row small"><button class="btn sm ghost" data-fav="' + U.esc(id) + '">' + fav + '</button>' +
          '<a href="#/node/' + U.esc(id) + '" data-open="' + U.esc(id) + '">' + U.esc(n.title) + '</a></div>';
      }).join('');
    }
    var recent = PO.analyze.nodesArr(W, true).sort(function (a, b) { return a.updated < b.updated ? 1 : -1; }).slice(0, 8).map(function (n) { return n.id; });
    return '<div class="small muted">Recent</div>' + items(recent, 'nothing yet') +
      '<div class="small muted" style="margin-top:6px">★ Favorites</div>' + items(W.favorites, 'star items to pin them here') +
      '<div class="small muted" style="margin-top:6px">⏱ Browsing history</div>' + items(W.history, 'nothing yet');
  }
  function searchQA(W, host, ui) {
    var detail = !!ui.state.qaDetail;
    host.innerHTML = '<div class="card"><h3>Ask about this workspace</h3>' +
      '<div class="row"><input type="text" id="qaQ" class="grow" placeholder="e.g. how does login work?">' +
      '<select id="qaMode" style="max-width:150px" title="How many matching nodes to show"><option value="short"' + (!detail ? ' selected' : '') + '>Top 3 matches</option>' +
      '<option value="detailed"' + (detail ? ' selected' : '') + '>Detailed (6)</option></select>' +
      '<button class="btn primary" id="qaGo">Ask</button></div>' +
      '<div id="qaOut"></div></div>';
    function ask() {
      var q = host.querySelector('#qaQ').value.trim();
      if (!q) return;
      var a = PO.analyze.answerQuestion(W, q);
      var hits = detail ? a.hits : a.hits.slice(0, 3);
      host.querySelector('#qaOut').innerHTML = '<div class="qa-answer">' + U.esc(a.text) + '</div>' +
        hits.map(function (h) {
          return '<div class="search-hit" data-hit="' + U.esc(h.node.id) + '"><strong>' + U.highlight(h.node.title, q) + '</strong> ' + ui.statusPill(h.node) +
            '<div class="small muted">' + U.highlight((h.node.text || '').slice(0, 200), q) + '</div>' +
            (h.node.anchor ? '<div class="tiny dim">⌖ chars ' + h.node.anchor.start + '–' + h.node.anchor.end + ' — click to highlight in Source</div>' : '') + '</div>';
        }).join('');
      host.querySelectorAll('[data-hit]').forEach(function (x) {
        x.onclick = function () { ui.select(x.dataset.hit, 'qa'); ui.setTab('source'); };
      });
    }
    host.querySelector('#qaMode').onchange = function (e) { ui.state.qaDetail = e.target.value === 'detailed'; ask(); };
    host.querySelector('#qaGo').onclick = ask;
    host.querySelector('#qaQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') ask(); });
  }
  function searchSaved(W, host, ui) {
    host.innerHTML = '<div class="card"><h3>Saved queries (' + W.queries.length + ')</h3>' +
      (W.queries.map(function (q, i) {
        return '<div class="row small" style="padding:5px 0"><strong style="flex:1">' + U.esc(q.name) + '</strong>' +
          '<span class="dim mono tiny">' + U.esc([q.q, q.type, q.status, q.tag].filter(function (x) { return x && x !== 'any'; }).join(' · ') || '—') + '</span>' +
          '<button class="btn sm" data-qrun="' + i + '">Run</button><button class="btn sm ghost" data-qdel="' + i + '">×</button></div>';
      }).join('') || '<div class="empty">No saved queries. Run a search, then press “⭐ save”.</div>') + '</div>';
    host.querySelectorAll('[data-qrun]').forEach(function (b) {
      b.onclick = function () {
        var q = W.queries[+b.dataset.qrun];
        ui.state.filters = { q: q.q || '', type: q.type || 'any', status: q.status || 'any', tag: q.tag || '', confMin: q.confMin || 0, source: q.source || '' };
        ui.state.sub.search = 'search'; ui.render();
      };
    });
    host.querySelectorAll('[data-qdel]').forEach(function (b) {
      b.onclick = function () { W.queries.splice(+b.dataset.qdel, 1); PO.store.touch(); PO.store.persist(); ui.render(); };
    });
  }

  /* ================= VERSIONS ================= */
  PO.uiTabs.versions = function (W, host, ui) {
    var sub = ui.state.sub.versions;
    host.innerHTML = ui.tabHeadHTML(W, 'Versions', 'Every change recorded, diffable, and restorable. Tests live here too.') +
      subbar(ui, 'versions', [['history', '🕘 History & diffs'], ['tests', '🧪 Test cases'], ['compare', '⇔ Compare versions']]) +
      '<div id="vBody"></div>';
    ui.wireTabHead(host); wireSubbar(host, ui, 'versions');
    var body = host.querySelector('#vBody');
    if (sub === 'history') versionsHistory(W, body, ui);
    else if (sub === 'tests') versionsTests(W, body, ui);
    else versionsCompare(W, body, ui);
  };
  function versionsHistory(W, host, ui) {
    host.innerHTML = '<div class="card"><h3>Snapshots (' + W.snapshots.length + ')</h3>' +
      '<div class="row"><button class="btn sm primary" id="vSnap">⤓ Save offline snapshot now</button>' +
      '<span class="small muted">Snapshots are tracked here; re-upload the file to restore.</span></div>' +
      W.snapshots.slice(0, 10).map(function (s) {
        return '<div class="small" style="padding:2px 0">📸 ' + U.esc(s.label) + ' · ' + U.fmtDate(s.at) + ' · ' + s.nodes + ' nodes</div>';
      }).join('') + '</div>' +
      '<div class="card"><h3>Version ledger (' + W.versions.length + ')</h3>' +
      (W.versions.slice(0, 120).map(function (v, i) {
        return '<div class="row small" style="padding:4px 0;border-bottom:1px solid #202a3a"><span class="pill">#' + v.n + '</span>' +
          '<span class="pill">' + U.esc(v.kind) + '</span><span style="flex:1">' + U.esc(v.summary) + '</span>' +
          '<span class="dim">' + U.fmtAgo(v.at) + '</span>' +
          ((v.before || v.after) ? '<button class="btn sm ghost" data-vd="' + i + '">diff</button>' : '') + '</div>' +
          '<div id="vd-' + i + '"></div>';
      }).join('') || '<p class="muted">No versions yet.</p>') + '</div>';
    host.querySelector('#vSnap').onclick = PO.snapshot.downloadSnapshot;
    host.querySelectorAll('[data-vd]').forEach(function (b) {
      b.onclick = function () {
        var v = W.versions[+b.dataset.vd];
        var box = host.querySelector('#vd-' + b.dataset.vd);
        if (box.dataset.open === '1') { box.innerHTML = ''; box.dataset.open = ''; b.textContent = 'diff'; return; } // toggle closed
        var ops = U.lineDiff((v.before || '').split('\n'), (v.after || '').split('\n'));
        var s = U.diffSummary(ops);
        box.dataset.open = '1';
        b.textContent = 'hide';
        box.innerHTML = '<div class="small muted">+' + s.add + ' / −' + s.del + '</div><div style="background:#0b0e13;border-radius:8px;padding:6px">' + U.diffHTML(ops) + '</div>';
      };
    });
  }
  function versionsTests(W, host, ui) {
    var T = PO.tests;
    host.innerHTML = '<div class="toolbar"><button class="btn primary sm" id="tNew">＋ Test case</button>' +
      '<span class="small muted">' + W.tests.length + ' cases · ' + W.runs.length + ' runs</span><span class="flex-spacer"></span>' +
      '<select id="tPrompt" style="max-width:200px" title="Prompt under test">' + W.prompts.map(function (p) {
        return '<option value="' + p.id + '"' + ((ui.state.testRun.promptId || (W.prompts[0] || {}).id) === p.id ? ' selected' : '') + '>' + U.esc(p.name) + '</option>';
      }).join('') + '</select><select id="tVer" style="max-width:90px"></select>' +
      '<button class="btn sm primary" id="tRun">▶ Run all (mock)</button></div>' +
      '<div id="tList"></div><div id="tRes"></div>';
    var pSel = host.querySelector('#tPrompt'), vSel = host.querySelector('#tVer');
    function fillVers() {
      var p = W.prompts.filter(function (x) { return x.id === pSel.value; })[0];
      vSel.innerHTML = p ? p.vers.map(function (v) { return '<option value="' + v.v + '">v' + v.v + '</option>'; }).join('') : '';
      if (p) vSel.value = ui.state.testRun.version || p.vers.length;
    }
    fillVers();
    pSel.onchange = function () { ui.state.testRun.promptId = pSel.value; ui.state.testRun.version = null; fillVers(); };
    vSel.onchange = function () { ui.state.testRun.version = +vSel.value; };
    ui.state.testRun.promptId = pSel.value; ui.state.testRun.version = +vSel.value;

    host.querySelector('#tNew').onclick = function () { testEditModal(W, ui, null); };
    host.querySelector('#tRun').onclick = function () {
      var run = T.runAll(W, { promptId: pSel.value, version: +vSel.value, model: 'mock-model' });
      ui.state.testRun.lastRun = run.id;
      PO.store.touch(); PO.store.persist(); ui.render();
      ui.toast('Run complete: ' + run.passed + '/' + run.total + ' passed.', run.passed === run.total ? 'ok' : 'warn');
    };
    var list = host.querySelector('#tList');
    list.innerHTML = W.tests.map(function (t) {
      var last = W.runs.map(function (r) { return (r.results || []).filter(function (x) { return x.testId === t.id; })[0]; }).filter(Boolean)[0];
      return '<div class="card"><div class="row"><strong style="flex:1">🧪 ' + U.esc(t.name) + '</strong>' +
        '<span class="mono tiny dim">' + U.esc(t.id) + '</span>' +
        (last ? (last.pass ? '<span class="pill st-asserted">pass ' + last.score + '</span>' : '<span class="pill st-uncertain">fail ' + last.score + '</span>') : '<span class="pill">unrun</span>') + '</div>' +
        '<div class="small muted">Input: ' + U.esc((t.inputText || (t.inputRef ? JSON.stringify(t.inputRef) : '')).slice(0, 160)) + '</div>' +
        '<div class="small">Expected (' + U.esc((t.expected || {}).kind) + '): ' + U.esc(T.expectedSummary(t).slice(0, 200)) + '</div>' +
        '<div class="small muted">Rule: ' + U.esc(((T.RULES.filter(function (r) { return r.id === (t.scoring || {}).rule; })[0] || {}).label) || (t.scoring || {}).rule) +
        (t.scoring && t.scoring.param ? ' — “' + U.esc(t.scoring.param) + '”' : '') + ' · linked: ' + (t.linked || []).join(', ') + '</div>' +
        '<div class="row" style="margin-top:6px"><button class="btn sm" data-tedit="' + U.esc(t.id) + '">Edit</button>' +
        '<button class="btn sm" data-tpaste="' + U.esc(t.id) + '">Paste actual output</button>' +
        '<button class="btn sm ghost" data-tdel="' + U.esc(t.id) + '">Delete</button></div></div>';
    }).join('') || '<div class="empty">No test cases. Create one to start evaluating prompt versions.</div>';
    list.querySelectorAll('[data-tedit]').forEach(function (b) { b.onclick = function () { testEditModal(W, ui, b.dataset.tedit); }; });
    list.querySelectorAll('[data-tdel]').forEach(function (b) {
      b.onclick = function () {
        W.tests = W.tests.filter(function (t) { return t.id !== b.dataset.tdel; });
        delete W.nodes[b.dataset.tdel];
        PO.store.log('test-delete', 'Deleted test ' + b.dataset.tdel, null);
        PO.store.touch(); PO.store.persist(); ui.render();
      };
    });
    list.querySelectorAll('[data-tpaste]').forEach(function (b) {
      b.onclick = function () {
        var t = W.tests.filter(function (x) { return x.id === b.dataset.tpaste; })[0];
        ui.modal('<h2>Paste actual output — ' + U.esc(t.name) + '</h2>',
          '<p class="small muted">Run the prompt in any model, paste its output. It is scored with <strong>' + U.esc(t.scoring.rule) + '</strong> and stored with model + timestamp.</p>' +
          '<textarea id="tpOut" style="min-height:180px"></textarea><p></p>' +
          '<div class="row"><input type="text" id="tpModel" placeholder="model (e.g. claude-3.5)" style="max-width:200px">' +
          ((t.scoring || {}).rule === 'manual' ? '<input type="number" id="tpScore" min="0" max="100" placeholder="score 0–100" style="max-width:140px">' : '') + '</div>',
          [{ label: 'Cancel' }, {
            label: 'Score & record', primary: true, onClick: function () {
              var out = (U.$('tpOut') || {}).value || '';
              var r = T.scoreOutput(t, out, (U.$('tpScore') || {}).value);
              var run = {
                id: U.uid('run'), at: U.nowISO(), model: (U.$('tpModel') || {}).value || 'pasted-output',
                promptId: pSel.value, version: +vSel.value, passed: r.pass ? 1 : 0, total: 1, avg: r.score,
                results: [{ testId: t.id, pass: r.pass, score: r.score, detail: r.detail, actual: out.slice(0, 6000) }]
              };
              W.runs.unshift(run);
              PO.store.log('test-run', 'Recorded output for ' + t.id + ': ' + (r.pass ? 'PASS' : 'FAIL') + ' (' + r.score + ').', t.id);
              PO.store.touch(); PO.store.persist(); ui.closeModal(); ui.render();
            }
          }]);
      };
    });
    // recent runs + best version
    var res = host.querySelector('#tRes');
    var p = W.prompts.filter(function (x) { return x.id === pSel.value; })[0];
    var best = p ? T.bestVersion(W, p.id) : null;
    res.innerHTML = '<div class="card"><h3>Recent runs' + (best ? ' — ★ best: v' + best.version + ' (' + best.runs + ' runs)' : '') + '</h3>' +
      (W.runs.slice(0, 10).map(function (r) {
        return '<div class="row small" style="padding:3px 0"><span class="pill">' + (r.passed === r.total ? '✓' : 'Δ') + ' ' + r.passed + '/' + r.total + '</span>' +
          '<span style="flex:1">' + U.esc(r.model) + (r.version ? ' · v' + r.version : '') + ' · avg ' + r.avg + '</span>' +
          '<span class="dim">' + U.fmtAgo(r.at) + '</span><button class="btn sm ghost" data-rv="' + r.id + '">view</button></div>' +
          '<div id="rv-' + r.id + '"></div>';
      }).join('') || '<p class="muted small">No runs yet.</p>') + '</div>';
    res.querySelectorAll('[data-rv]').forEach(function (b) {
      b.onclick = function () {
        var r = W.runs.filter(function (x) { return x.id === b.dataset.rv; })[0];
        document.getElementById('rv-' + r.id).innerHTML = r.results.map(function (x) {
          var t = W.tests.filter(function (y) { return y.id === x.testId; })[0] || { name: x.testId };
          return '<div class="small" style="border-top:1px solid #202a3a;padding:6px 0"><strong>' + U.esc(t.name) + '</strong> ' +
            (x.pass ? '<span class="ok-t">PASS</span>' : '<span class="bad-t">FAIL</span>') + ' ' + x.score + ' — ' + U.esc(x.detail) +
            '<div class="tiny dim">expected: ' + U.esc(T.expectedSummary(t).slice(0, 200)) + '</div>' +
            '<pre class="tiny" style="max-height:150px">' + U.esc((x.actual || '').slice(0, 1200)) + '</pre></div>';
        }).join('');
      };
    });
  }
  function testEditModal(W, ui, id) {
    var t = id ? W.tests.filter(function (x) { return x.id === id; })[0] : null;
    t = t || { name: '', inputText: '', expected: { kind: 'text', text: '' }, scoring: { rule: 'contains', param: '' }, inputRef: null };
    ui.modal('<h2>' + (id ? 'Edit' : 'New') + ' test case</h2>',
      '<label class="small muted">Name</label><input type="text" id="teName" value="' + U.esc(t.name) + '"><p></p>' +
      '<label class="small muted">Input prompt (or leave blank and reference a subtree below)</label><textarea id="teInput">' + U.esc(t.inputText || '') + '</textarea><p></p>' +
      '<div class="row"><div style="flex:1"><label class="small muted">Expected kind</label><select id="teKind">' +
      ['text', 'facts', 'rubric'].map(function (k) { return '<option' + ((t.expected || {}).kind === k ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select></div>' +
      '<div style="flex:1"><label class="small muted">Scoring rule</label><select id="teRule">' +
      PO.tests.RULES.map(function (r) { return '<option value="' + r.id + '"' + ((t.scoring || {}).rule === r.id ? ' selected' : '') + '>' + r.label + '</option>'; }).join('') + '</select></div></div><p></p>' +
      '<label class="small muted">Expected output / facts (one per line) / rubric (name=weight per line)</label><textarea id="teExp">' +
      U.esc((t.expected || {}).kind === 'facts' ? (t.expected.facts || []).join('\n') : (t.expected || {}).kind === 'rubric' ? (t.expected.criteria || []).map(function (c) { return c.name + '=' + c.weight; }).join('\n') : (t.expected || {}).text || '') + '</textarea><p></p>' +
      '<label class="small muted">Rule param (substring / keywords a,b / min,max words)</label><input type="text" id="teParam" value="' + U.esc((t.scoring || {}).param || '') + '">',
      [{ label: 'Cancel' }, {
        label: 'Save', primary: true, onClick: function () {
          var kind = U.$('teKind').value, expRaw = U.$('teExp').value;
          var exp = { kind: kind };
          if (kind === 'facts') exp.facts = expRaw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
          else if (kind === 'rubric') exp.criteria = expRaw.split('\n').map(function (s) { var p = s.split('='); return { name: (p[0] || '').trim(), weight: +(p[1] || 1) }; }).filter(function (c) { return c.name; });
          else exp.text = expRaw;
          if (id) {
            t.name = U.$('teName').value; t.inputText = U.$('teInput').value; t.expected = exp;
            t.scoring = { rule: U.$('teRule').value, param: U.$('teParam').value }; t.updated = U.nowISO();
            var n = W.nodes[id];
            if (n) { n.title = t.name; n.updated = U.nowISO(); }
            PO.store.log('test-edit', 'Edited test ' + id, id);
          } else {
            PO.tests.createTest(W, { name: U.$('teName').value || 'Untitled case', inputText: U.$('teInput').value, expected: exp, scoring: { rule: U.$('teRule').value, param: U.$('teParam').value } });
          }
          PO.store.touch(); PO.store.persist(); ui.closeModal(); ui.render();
        }
      }]);
  }
  function versionsCompare(W, host, ui) {
    if (W.runs.length < 1) { host.innerHTML = '<div class="empty">Run some tests first (Versions → Test cases), then compare here.</div>'; return; }
    var c = ui.state.compare;
    if (!c.a && W.runs[0]) c.a = W.runs[0].id;
    if (!c.b && W.runs[1]) c.b = W.runs[1].id;
    var opts = W.runs.map(function (r) {
      return '<option value="' + r.id + '">' + U.fmtDate(r.at) + ' · ' + U.esc(r.model) + (r.version ? ' v' + r.version : '') + ' · ' + r.passed + '/' + r.total + '</option>';
    }).join('');
    host.innerHTML = '<div class="toolbar"><select id="cA" style="max-width:300px">' + opts + '</select><span>vs</span>' +
      '<select id="cB" style="max-width:300px">' + opts + '</select>' +
      '<select id="cF" style="max-width:160px">' + ['changed', 'failed', 'passed', 'all'].map(function (f) {
        return '<option' + (c.filter === f ? ' selected' : '') + '>' + f + '</option>';
      }).join('') + '</select></div><div id="cOut"></div>';
    host.querySelector('#cA').value = c.a || '';
    host.querySelector('#cB').value = c.b || '';
    host.querySelector('#cA').onchange = function (e) { c.a = e.target.value; draw(); };
    host.querySelector('#cB').onchange = function (e) { c.b = e.target.value; draw(); };
    host.querySelector('#cF').onchange = function (e) { c.filter = e.target.value; draw(); };
    function draw() {
      var a = W.runs.filter(function (r) { return r.id === c.a; })[0];
      var b = W.runs.filter(function (r) { return r.id === c.b; })[0];
      var out = host.querySelector('#cOut');
      if (!a || !b) { out.innerHTML = '<div class="empty">Pick two runs.</div>'; return; }
      var rows = PO.tests.compareRuns(a, b).filter(function (r) {
        if (c.filter === 'all') return true;
        if (c.filter === 'changed') return r.changed;
        if (c.filter === 'failed') return !(r.a.pass && (r.b || {}).pass);
        return r.a.pass && (r.b || {}).pass;
      });
      out.innerHTML = '<div class="card"><h3>Summary — A: ' + a.passed + '/' + a.total + ' · B: ' + b.passed + '/' + b.total +
        ' · ' + rows.length + ' case(s) shown</h3>' +
        rows.map(function (r, i) {
          var t = W.tests.filter(function (x) { return x.id === r.testId; })[0] || { name: r.testId };
          var diff = r.b ? U.lineDiff((r.a.actual || '').split('\n'), (r.b.actual || '').split('\n')) : [];
          var s = U.diffSummary(diff);
          return '<div class="small" style="border-top:1px solid #202a3a;padding:6px 0"><strong>' + U.esc(t.name) + '</strong> ' +
            '<span class="' + (r.a.pass ? 'ok-t' : 'bad-t') + '">A:' + (r.a.pass ? 'pass' : 'fail') + ' ' + r.a.score + '</span> vs ' +
            (r.b ? '<span class="' + (r.b.pass ? 'ok-t' : 'bad-t') + '">B:' + (r.b.pass ? 'pass' : 'fail') + ' ' + r.b.score + '</span>' : '<span class="dim">no B</span>') +
            (r.changed ? ' <span class="pill stale">changed</span>' : '') +
            (r.b ? '<div class="tiny muted">output diff: +' + s.add + '/−' + s.del + ' lines</div><div style="background:#0b0e13;border-radius:8px;padding:4px;max-height:220px;overflow:auto">' + U.diffHTML(diff, 2) + '</div>' : '') + '</div>';
        }).join('') + '</div>';
    }
    draw();
  }

  /* ================= TRACEABILITY ================= */
  PO.uiTabs.trace = function (W, host, ui) {
    var sub = ui.state.sub.trace;
    host.innerHTML = ui.tabHeadHTML(W, 'Traceability', 'Hard requirements, preferences, non-goals — linked to what implements them.') +
      subbar(ui, 'trace', [['links', '🔗 Links'], ['reqs', '📌 Requirements'], ['gaps', '🕳 Gaps & negative space']]) +
      '<div id="tBody"></div>';
    ui.wireTabHead(host); wireSubbar(host, ui, 'trace');
    var body = host.querySelector('#tBody');
    if (sub === 'links') traceLinks(W, body, ui);
    else if (sub === 'reqs') traceReqs(W, body, ui);
    else traceGaps(W, body, ui);
  };
  function traceLinks(W, host, ui) {
    var sel = ui.state.nodeId && W.nodes[ui.state.nodeId];
    var relCounts = {};
    W.edges.forEach(function (e) { relCounts[e.rel] = (relCounts[e.rel] || 0) + 1; });
    host.innerHTML = '<div class="card"><h3>Relationship mix (' + W.edges.length + ')</h3><div class="chips">' +
      Object.keys(relCounts).map(function (r) { return '<span class="pill">' + (PO.store.REL_LABEL[r] || r) + ': ' + relCounts[r] + '</span>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>Selected node links' + (sel ? ' — ' + U.esc(sel.id) : '') + '</h3>' +
      (sel ? selLinks(W, ui, sel) : '<p class="muted small">Pick a node in the Tree to inspect its links.</p>') + '</div>';
    wireSelLinks(W, host, ui, sel);
  }
  function selLinks(W, ui, sel) {
    function edgeRows(es, dir) {
      return es.map(function (e) {
        var o = W.nodes[dir === 'in' ? e.a : e.b];
        return '<tr><td>' + (dir === 'in' ? '←' : '→') + '</td><td><span class="pill">' + (PO.store.REL_LABEL[e.rel] || e.rel) + '</span>' +
          (e.auto ? ' <span class="tiny dim">auto</span>' : '') + '</td><td>' + (o ? nodeLink(o) : '<span class="dim">?</span>') + '</td>' +
          '<td class="small muted">' + U.esc(e.note || '') + '</td><td><button class="btn sm ghost" data-edel="' + e.id + '">×</button></td></tr>';
      }).join('');
    }
    var back = PO.analyze.backlinks(W, sel.id), fwd = PO.analyze.forwardLinks(W, sel.id);
    return '<div class="row"><button class="btn sm primary" id="tlAdd">＋ Add link</button>' +
      '<span class="small muted">' + back.length + ' in · ' + fwd.length + ' out</span></div>' +
      '<table class="tbl"><tr><th></th><th>rel</th><th>node</th><th>note</th><th></th></tr>' +
      edgeRows(back, 'in') + edgeRows(fwd, 'out') + '</table>';
  }
  function wireSelLinks(W, host, ui, sel) {
    if (!sel) return;
    host.querySelector('#tlAdd').onclick = function () { ui.openAddEdgeModal(sel.id); };
    host.querySelectorAll('[data-edel]').forEach(function (b) {
      b.onclick = function () {
        W.edges = W.edges.filter(function (e) { return e.id !== b.dataset.edel; });
        PO.store.log('edge-delete', 'Removed a link from ' + sel.id + '.', sel.id);
        PO.store.touch(); PO.store.persist(); ui.render();
      };
    });
  }
  function traceReqs(W, host, ui) {
    var cov = PO.analyze.coverage(W);
    host.innerHTML = '<div class="card"><h3>Requirements (' + W.requirements.length + ') — coverage ' + cov.pct + '%</h3>' +
      '<div class="row"><button class="btn sm primary" id="rqNew">＋ Requirement</button>' +
      '<span class="small muted">Extraction is assistive: every row shows its source and can be edited or removed.</span></div><p></p>' +
      '<table class="tbl"><tr><th>kind</th><th>requirement</th><th>source</th><th>implemented by</th><th></th></tr>' +
      W.requirements.map(function (r) {
        var src = W.nodes[r.sourceNodeId];
        var impl = W.edges.filter(function (e) { return e.rel === 'implements' && (e.a === r.id || e.b === r.id); })
          .map(function (e) { return W.nodes[e.a === r.id ? e.b : e.a]; }).filter(Boolean);
        (r.implementsIds || []).forEach(function (id) { if (W.nodes[id] && !impl.some(function (x) { return x.id === id; })) impl.push(W.nodes[id]); });
        return '<tr><td><span class="pill ' + (r.kind === 'hard' ? 'st-uncertain' : r.kind === 'non-goal' ? 'st-inferred' : '') + '">' + r.kind + '</span></td>' +
          '<td class="small">' + U.esc(r.text) + '<div class="tiny dim mono">' + U.esc(r.id) + '</div></td>' +
          '<td class="small">' + (src ? nodeLink(src) : '<span class="dim">—</span>') + '</td>' +
          '<td class="small">' + (impl.length ? impl.map(function (x) { return '<a href="#/node/' + U.esc(x.id) + '">' + U.esc(x.title) + '</a>'; }).join('<br>') : '<span class="warn-t">⚠ gap — nothing implements this</span>') + '</td>' +
          '<td><button class="btn sm ghost" data-rqedit="' + U.esc(r.id) + '">✎</button> <button class="btn sm ghost" data-rqdel="' + U.esc(r.id) + '">×</button></td></tr>';
      }).join('') + '</table></div>';
    host.querySelector('#rqNew').onclick = function () { reqModal(W, ui, null); };
    host.querySelectorAll('[data-rqedit]').forEach(function (b) { b.onclick = function () { reqModal(W, ui, b.dataset.rqedit); }; });
    host.querySelectorAll('[data-rqdel]').forEach(function (b) {
      b.onclick = function () {
        W.requirements = W.requirements.filter(function (r) { return r.id !== b.dataset.rqdel; });
        delete W.nodes[b.dataset.rqdel];
        W.edges = W.edges.filter(function (e) { return e.a !== b.dataset.rqdel && e.b !== b.dataset.rqdel; });
        PO.store.log('req-delete', 'Removed requirement ' + b.dataset.rqdel, null);
        PO.store.touch(); PO.store.persist(); ui.render();
      };
    });
  }
  function reqModal(W, ui, id) {
    var r = id ? W.requirements.filter(function (x) { return x.id === id; })[0] : { kind: 'hard', text: '', implementsIds: [] };
    var feats = PO.analyze.nodesArr(W).filter(function (n) { return n.type === 'feature' || n.type === 'script' || n.type === 'mechanic'; }).slice(0, 200);
    ui.modal('<h2>' + (id ? 'Edit' : 'New') + ' requirement</h2>',
      '<div class="row"><select id="rqKind" style="max-width:160px">' + ['hard', 'soft', 'non-goal'].map(function (k) {
        return '<option' + (r.kind === k ? ' selected' : '') + '>' + k + '</option>';
      }).join('') + '</select></div><p></p>' +
      '<label class="small muted">Text (verbatim)</label><textarea id="rqText">' + U.esc(r.text || '') + '</textarea><p></p>' +
      '<label class="small muted">Implemented by (Ctrl-click for several)</label><select id="rqImpl" multiple size="6">' +
      feats.map(function (f) { return '<option value="' + U.esc(f.id) + '"' + ((r.implementsIds || []).indexOf(f.id) >= 0 ? ' selected' : '') + '>' + U.esc(f.title + ' (' + f.id + ')') + '</option>'; }).join('') + '</select>',
      [{ label: 'Cancel' }, {
        label: 'Save', primary: true, onClick: function () {
          var impl = Array.prototype.slice.call(U.$('rqImpl').selectedOptions).map(function (o) { return o.value; });
          if (id) {
            r.kind = U.$('rqKind').value; r.text = U.$('rqText').value; r.implementsIds = impl;
            var n = W.nodes[id];
            if (n) { n.title = r.text.slice(0, 80); n.text = r.text; n.updated = U.nowISO(); }
            PO.store.log('req-edit', 'Edited requirement ' + id, id);
          } else {
            var nid = 'req.' + U.slug(U.$('rqText').value, 34);
            if (W.nodes[nid]) nid = PO.ingest.makeId(W, 'requirement', U.$('rqText').value);
            var t = U.nowISO();
            W.nodes[nid] = {
              id: nid, title: U.$('rqText').value.slice(0, 80), type: 'requirement', status: 'asserted',
              text: U.$('rqText').value, quote: '', anchor: null, parent: 'folder.requirements',
              tags: ['requirement', U.$('rqKind').value], entities: [], conf: 1, created: t, updated: t, ver: 1,
              why: 'Created by user.', stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
            };
            W.requirements.push({ id: nid, kind: U.$('rqKind').value, text: U.$('rqText').value, sourceNodeId: null, implementsIds: impl, status: 'open', created: t });
            PO.store.log('req-add', 'Requirement ' + nid + ' added.', nid);
          }
          impl.forEach(function (fid) {
            if (!W.edges.some(function (e) { return e.rel === 'implements' && ((e.a === fid && e.b === (id || '')) || (e.a === (id || '') && e.b === fid)); })) {
              W.edges.push({ id: U.uid('e'), a: fid, b: (id || W.requirements[W.requirements.length - 1].id), rel: 'implements', note: 'Linked in requirement editor.', auto: false, created: U.nowISO() });
            }
          });
          PO.store.touch(); PO.store.persist(); ui.closeModal(); ui.render();
        }
      }]);
  }
  function traceGaps(W, host, ui) {
    var neg = PO.analyze.negativeSpace(W);
    var cov = PO.analyze.coverage(W);
    var orph = PO.analyze.orphans(W);
    host.innerHTML = '<div class="card"><h3>🕳 Negative-space report (' + neg.length + ')</h3>' +
      '<p class="small muted">Expected-but-missing pieces inferred from what the prompt <em>does</em> mention (e.g. login without logout).</p>' +
      (neg.map(function (g) {
        return '<div class="small" style="padding:3px 0">Mentions <strong>' + U.esc(g.trigger) + '</strong> but never <span class="warn-t"><strong>' + U.esc(g.missing) + '</strong></span> ' +
          '<button class="btn sm ghost" data-gap="' + U.esc(g.missing) + '">＋ add as idea</button></div>';
      }).join('') || '<p class="ok-t small">✓ No obvious gaps.</p>') + '</div>' +
      '<div class="two-col"><div class="card"><h3>Coverage gaps (' + cov.gaps.length + ')</h3>' +
      (cov.gaps.map(function (r) {
        return '<div class="small" style="padding:3px 0"><span class="pill">' + r.kind + '</span> ' + U.esc(r.text.slice(0, 120)) +
          ' <button class="btn sm ghost" data-gapreq="' + U.esc(r.id) + '">link →</button></div>';
      }).join('') || '<p class="ok-t small">✓ All requirements have implementers.</p>') + '</div>' +
      '<div class="card"><h3>Orphan suggestions (' + orph.length + ')</h3>' +
      (orph.slice(0, 20).map(function (n) {
        var sug = suggestParent(W, n);
        return '<div class="small" style="padding:3px 0">' + nodeLink(n) +
          (sug ? '<div class="tiny">↳ suggested: <a href="#/node/' + U.esc(sug.id) + '">' + U.esc(sug.title) + '</a> <button class="btn sm ghost" data-orph="' + U.esc(n.id + '|' + sug.id) + '">move</button></div>' : '') + '</div>';
      }).join('') || '<p class="ok-t small">✓ No orphans.</p>') + '</div></div>' +
      '<div class="card"><h3>Open questions (' + W.questions.filter(function (q) { return !q.resolved; }).length + ')</h3>' +
      W.questions.filter(function (q) { return !q.resolved; }).slice(0, 40).map(function (q) {
        var n = W.nodes[q.nodeId];
        return '<div class="small" style="padding:3px 0">❓ ' + U.esc(q.q) + ' <span class="dim">— ' + (n ? '<a href="#/node/' + U.esc(n.id) + '">' + U.esc(n.title) + '</a>' : q.nodeId) + '</span> ' +
          '<button class="btn sm ghost" data-qres="' + q.id + '">resolve</button></div>';
      }).join('') + '</div>';
    host.querySelectorAll('[data-gap]').forEach(function (b) {
      b.onclick = function () {
        var title = 'Consider: ' + b.dataset.gap, t = U.nowISO();
        var id = PO.ingest.makeId(W, 'idea', title);
        W.nodes[id] = {
          id: id, title: title, type: 'idea', status: 'inferred', text: 'The prompt never mentions “' + b.dataset.gap + '”. Should it?',
          quote: '', anchor: null, parent: 'folder.ideas', tags: ['gap'], entities: [], conf: 0.5, created: t, updated: t, ver: 1,
          why: 'Negative-space suggestion accepted by user.', stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
        };
        PO.store.log('gap-accept', 'Added idea for missing “' + b.dataset.gap + '”.', id);
        PO.store.touch(); PO.store.persist(); ui.render();
      };
    });
    host.querySelectorAll('[data-gapreq]').forEach(function (b) {
      b.onclick = function () { reqModal(W, ui, b.dataset.gapreq); };
    });
    host.querySelectorAll('[data-orph]').forEach(function (b) {
      b.onclick = function () {
        var p = b.dataset.orph.split('|');
        ui.reparentNode(W, p[0], p[1]); PO.store.persist();
      };
    });
    host.querySelectorAll('[data-qres]').forEach(function (b) {
      b.onclick = function () {
        var q = W.questions.filter(function (x) { return x.id === b.dataset.qres; })[0];
        if (q) q.resolved = true;
        PO.store.touch(); PO.store.persist(); ui.render();
      };
    });
  }
  function suggestParent(W, n) {
    // best topic/feature parent by tag/entity overlap
    var best = null, bs = 0;
    PO.analyze.nodesArr(W).forEach(function (c) {
      if (c.id === n.id || (c.type !== 'topic' && c.type !== 'feature' && c.type !== 'folder')) return;
      var s = 0;
      (n.tags || []).forEach(function (t) { if ((c.tags || []).indexOf(t) >= 0) s += 2; });
      (n.entities || []).forEach(function (e) { if ((c.entities || []).indexOf(e) >= 0) s += 1; });
      if (c.type === 'folder' && PO.store.TYPE_FOLDER[n.type] === c.id) s += 1;
      if (s > bs) { bs = s; best = c; }
    });
    return bs > 0 ? best : (W.nodes[PO.store.TYPE_FOLDER[n.type]] || null);
  }

  /* ================= RECOMPILE ================= */
  PO.uiTabs.recompile = function (W, host, ui) {
    var R = ui.state.recomp;
    if (!R.root || !W.nodes[R.root]) R.root = ui.state.nodeId || 'folder.root';
    host.innerHTML = ui.tabHeadHTML(W, 'Recompile', 'Turn any subtree back into a clean, budgeted prompt — with proof nothing was lost.') +
      '<div class="toolbar"><button class="btn sm" id="rcPick">📂 pick root…</button>' +
      '<strong>' + U.esc((W.nodes[R.root] || {}).title || R.root) + '</strong><span class="mono tiny dim">' + U.esc(R.root) + '</span>' +
      '<label class="small"><input type="checkbox" id="rcDeps"' + (R.withDeps ? ' checked' : '') + '> pull dependencies</label>' +
      '<label class="small"><input type="checkbox" id="rcAnch"' + (R.withAnchors ? ' checked' : '') + '> include source anchors</label>' +
      '<label class="small">budget <input type="number" id="rcBudget" value="' + R.budget + '" min="200" max="1000000" step="500" style="width:100px"> tok</label>' +
      '<button class="btn primary sm" id="rcGo">🧩 Recompile</button></div>' +
      '<div id="rcOut">' + (R.result ? '' : '<div class="empty">Choose a subtree root and press Recompile.</div>') + '</div>';
    ui.wireTabHead(host);
    host.querySelector('#rcPick').onclick = function () {
      ui.modalWide('<h2>Pick subtree root</h2>', '<div id="rcTree" style="max-height:50vh;overflow:auto">' + ui.treeHTML(W, 'folder.root', {}) + '</div>',
        [{ label: 'Cancel' }, {
          label: 'Use selected', primary: true, onClick: function () {
            if (ui.state.nodeId) R.root = ui.state.nodeId;
            ui.closeModal(); ui.render();
          }
        }]);
      ui.wireTree(U.$('rcTree'));
    };
    host.querySelector('#rcDeps').onchange = function (e) { R.withDeps = e.target.checked; };
    host.querySelector('#rcAnch').onchange = function (e) { R.withAnchors = e.target.checked; };
    host.querySelector('#rcBudget').onchange = function (e) { R.budget = +e.target.value || 8000; };
    host.querySelector('#rcGo').onclick = function () {
      var col = PO.recompile.collectSubtree(W, R.root, { withDeps: R.withDeps });
      var out = PO.recompile.buildPrompt(W, col, { budget: R.budget, withAnchors: R.withAnchors, withDeps: R.withDeps, title: 'Recompiled: ' + ((W.nodes[R.root] || {}).title || R.root) });
      var proof = PO.recompile.noLossDiff(W, R.root, out);
      R.result = { out: out, proof: proof, at: U.nowISO() };
      PO.store.log('recompile', 'Recompiled ' + R.root + ' → ' + out.tokens + ' tok (' + out.included.length + ' in, ' + out.dropped.length + ' out).', R.root);
      PO.store.touch(); PO.store.persist();
      drawResult(W, host, ui);
      ui.toast('Recompiled: ' + out.included.length + ' included · ' + out.dropped.length + ' dropped · ' + out.tokens + ' tokens.', out.fits ? 'ok' : 'warn');
    };
    if (R.result) drawResult(W, host, ui);
  };
  function drawResult(W, host, ui) {
    var R = ui.state.recomp, res = R.result, out = res.out, proof = res.proof;
    var pct = Math.min(100, Math.round(out.tokens / out.budget * 100));
    host.querySelector('#rcOut').innerHTML =
      (out.forcedDrops.length ? '<div class="card" style="border-color:var(--bad)"><h3 class="bad-t">⚠ Budget forced hard-constraint drops</h3>' +
        '<p class="small">These rules/requirements did <strong>not</strong> fit and were excluded. Raise the budget or narrow the subtree.</p>' +
        out.forcedDrops.map(function (id) { var n = W.nodes[id]; return '<div class="small">⛔ ' + (n ? nodeLink(n) : id) + '</div>'; }).join('') + '</div>' : '') +
      (out.dropped.length && !out.forcedDrops.length ? '<div class="card"><h3 class="warn-t">Dropped to fit budget (' + out.dropped.length + ' soft items)</h3><div class="small">' +
        out.dropped.map(function (id) { var n = W.nodes[id]; return n ? '<a href="#/node/' + U.esc(id) + '">' + U.esc(n.title) + '</a>' : id; }).join(' · ') + '</div></div>' : '') +
      '<div class="card"><div class="row"><h3 style="flex:1">Output — ' + U.fmtNum(out.tokens) + ' / ' + U.fmtNum(out.budget) + ' tokens (' + pct + '%)</h3>' +
      '<button class="btn sm" id="rcCopy">⧉ Copy</button><button class="btn sm" id="rcDl">⤓ .md</button>' +
      '<button class="btn sm" id="rcSaveP">💾 Save as prompt</button></div>' +
      '<div class="progress"><i style="width:' + pct + '%;background:' + (out.fits ? 'var(--ok)' : 'var(--bad)') + '"></i></div>' +
      '<p class="small muted">Sections: ' + out.sections.join(' → ') + ' · ' + out.included.length + ' items included</p>' +
      '<div class="two-col"><div><h4>Rendered</h4><div style="max-height:420px;overflow:auto;border:1px solid var(--line);border-radius:8px;padding:10px">' + PO.readme.mdToHTML(out.md) + '</div></div>' +
      '<div><h4>Raw</h4><pre style="max-height:420px">' + U.esc(out.md) + '</pre></div></div></div>' +
      '<div class="card"><h3>No-loss proof — ' + proof.found.length + '/' + proof.total + ' hard constraints verified in output</h3>' +
      (proof.total === 0 ? '<p class="small muted">No hard rules/requirements in this subtree — nothing to prove.</p>' :
        (proof.missing.length ? '<p class="bad-t small">⚠ Missing from output:</p>' + proof.missing.map(function (n) {
          return '<div class="small">⛔ ' + nodeLink(n) + '</div>';
        }).join('') : '<p class="ok-t small">✓ Every hard constraint is present in the output.</p>') +
        '<details><summary class="small">Source paragraphs checked (' + proof.srcLines.length + ')</summary><pre class="tiny">' + U.esc(proof.srcLines.slice(0, 60).join('\n')) + '</pre></details>') + '</div>';
    host.querySelector('#rcCopy').onclick = function () { U.copyText(out.md, 'Recompiled prompt copied'); };
    host.querySelector('#rcDl').onclick = function () { U.download('recompiled-' + U.slug(R.root, 30) + '.md', out.md, 'text/markdown'); };
    host.querySelector('#rcSaveP').onclick = function () {
      var r = PO.ingest.ingestPrompt(W, 'Recompiled: ' + ((W.nodes[R.root] || {}).title || R.root), out.md, {});
      PO.readme.regenerateAll(W); PO.store.touch(); PO.store.persist(); ui.render();
      ui.toast('Saved as prompt “' + U.esc(r.prompt.name) + '”.', 'ok');
    };
  }
})();
