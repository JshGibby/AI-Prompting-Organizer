/* ============================================================
   Prompt Organizer — branch-ai.js
   Core requested feature: click any tree node or entire branch,
   see full aggregated text, prompt for changes, pick output tokens,
   and have AI rewrite with good grammar & detail, updating every
   affected node.

   Also provides:
   - Right-click context menu on tree
   - Full-text viewer
   - Token size selector with explanations
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  var TOKEN_OPTIONS = [
    { v: 4000, label: '4,000 tokens', desc: 'Quick polish — ~1-2 paragraphs per item. Fastest & cheapest. Best for minor grammar fixes, short expansions, or tightening. Limited detail; may truncate large branches.', use: 'Minor edits, typo fixes' },
    { v: 8000, label: '8,000 tokens', desc: 'Standard — ~2-4 paragraphs per item. Balanced detail and speed. Good for most rewrites, clarifications, and adding examples. Fits medium branches.', use: 'Most rewrites, clarifications' },
    { v: 16000, label: '16,000 tokens', desc: 'Detailed — 4-8 paragraphs per item. Thorough expansion with background from workspace summary. Slower, richer, uses more context.', use: 'Deep detail, tutorials' },
    { v: 32000, label: '32,000 tokens', desc: 'Very detailed — deep rewrite with full project context integration. Handles large branches (30+ items). Slower, higher token cost, best quality.', use: 'Large branch overhauls' },
    { v: 64000, label: '64,000 tokens', desc: 'Maximum — comprehensive overhaul, exhaustive detail, preserves every nuance. Uses largest context window. Slowest, most expensive, but most complete. Best for major folder rewrites.', use: 'Major folder rewrite, docs' }
  ];

  function W() { return PO.store.W(); }

  function collectBranch(rootId) {
    var w = W();
    var out = [];
    var seen = {};
    function walk(id) {
      if (seen[id]) return;
      seen[id] = 1;
      var n = w.nodes[id];
      if (!n) return;
      out.push(n);
      PO.analyze.childrenOf(w, id).forEach(function (c) { walk(c.id); });
    }
    walk(rootId);
    // sort: folders first then by title
    out.sort(function (a, b) {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (b.type === 'folder' && a.type !== 'folder') return 1;
      return (a.title || '').localeCompare(b.title || '');
    });
    return out;
  }

  function aggregatedText(nodes, opts) {
    opts = opts || {};
    var lines = [];
    lines.push('BRANCH AGGREGATED CONTENT — ' + nodes.length + ' items');
    lines.push('Generated: ' + new Date().toISOString());
    lines.push('');
    nodes.forEach(function (n, i) {
      if (n.type === 'folder' && !opts.includeFolders) {
        // still show folder header but not empty text
        lines.push('--- [' + (i + 1) + '] FOLDER ' + n.id + ' — ' + n.title + ' ---');
        lines.push('(folder, contains ' + PO.analyze.childrenOf(W(), n.id).length + ' direct children)');
        lines.push('');
        return;
      }
      lines.push('--- [' + (i + 1) + '] ' + n.type.toUpperCase() + ' ' + n.id + ' — ' + (n.title || '') + ' ---');
      lines.push('Status: ' + n.status + ' | Conf: ' + Math.round((n.conf || 0) * 100) + '% | Tags: ' + (n.tags || []).join(', '));
      lines.push('Parent: ' + (n.parent || '—'));
      lines.push('');
      lines.push((n.text || '').trim() || '(no text)');
      lines.push('');
      lines.push('');
    });
    return lines.join('\n');
  }

  function projectSummary() {
    var w = W();
    try {
      var ctx = PO.ai.buildContext(w, '', { nodeId: (PO.ui && PO.ui.state && PO.ui.state.nodeId) || null });
      return ctx.slice(0, 6000);
    } catch (e) {
      return 'Workspace: ' + w.name + ' — ' + Object.keys(w.nodes).length + ' nodes';
    }
  }

  /* ---------- Full text viewer ---------- */
  function openFullTextViewer(rootId) {
    var nodes = collectBranch(rootId);
    var txt = aggregatedText(nodes, { includeFolders: true });
    var root = W().nodes[rootId];
    PO.ui.modalWide('<h2>📖 Full Text — ' + U.esc(root ? root.title : rootId) + ' <span class="mono tiny">' + U.esc(rootId) + '</span></h2>',
      '<div class="toolbar"><span class="small muted">' + nodes.length + ' items aggregated · ' + U.wordsOf(txt) + ' words · ~' + U.fmtNum(U.tokenEstimate(txt)) + ' tokens</span>' +
      '<span class="flex-spacer"></span>' +
      '<button class="btn sm" id="ftCopy">⧉ Copy all</button>' +
      '<button class="btn sm" id="ftDown">⤓ Download .md</button>' +
      '<button class="btn sm primary" id="ftEdit">✨ AI Enhance</button></div>' +
      '<div class="card" style="max-height:62vh;overflow:auto"><pre style="white-space:pre-wrap;margin:0">' + U.esc(txt) + '</pre></div>' +
      '<p class="tiny muted">This view shows every descendant verbatim. Use ✨ AI Enhance to rewrite with good grammar and detail.</p>',
      [{ label: 'Close', primary: true }]);
    document.getElementById('ftCopy').onclick = function () { U.copyText(txt, 'Full branch text copied'); };
    document.getElementById('ftDown').onclick = function () { U.download((root ? U.slug(root.title, 30) : rootId) + '-full.txt', txt, 'text/plain'); };
    document.getElementById('ftEdit').onclick = function () { PO.ui.closeModal(); openBranchEditor(rootId); };
  }

  /* ---------- Branch AI Editor Modal ---------- */
  function openBranchEditor(rootId) {
    var w = W();
    var nodes = collectBranch(rootId);
    var nonFolder = nodes.filter(function (n) { return n.type !== 'folder'; });
    var agg = aggregatedText(nodes, { includeFolders: false });
    var summary = projectSummary();
    var rootNode = w.nodes[rootId];

    // Build modal HTML
    var tokenRadios = TOKEN_OPTIONS.map(function (o, i) {
      return '<label class="token-opt' + (i === 1 ? ' sel' : '') + '" data-tok="' + o.v + '">' +
        '<input type="radio" name="tokSize" value="' + o.v + '"' + (i === 1 ? ' checked' : '') + '> ' +
        '<strong>' + o.label + '</strong> — <span class="small">' + U.esc(o.use) + '</span>' +
        '<div class="tiny muted" style="margin:4px 0 0 22px">' + U.esc(o.desc) + '</div>' +
        '<div class="tiny" style="margin:2px 0 0 22px"><span class="pill">' + o.v.toLocaleString() + ' output tokens</span> ' +
        '<span class="pill type">effect: ' + (o.v <= 4000 ? 'fast, concise' : o.v <= 8000 ? 'balanced' : o.v <= 16000 ? 'detailed, slower' : o.v <= 32000 ? 'very detailed, high cost' : 'maximum detail, slowest') + '</span></div>' +
        '</label>';
    }).join('');

    var body =
      '<div class="branch-ai-layout">' +
      '<div class="branch-ai-left">' +
      '<div class="card" style="margin-bottom:10px"><h3 style="margin:0 0 6px">📂 Selected Branch — ' + U.esc(rootNode ? rootNode.title : rootId) + '</h3>' +
      '<div class="small muted"><span class="mono">' + U.esc(rootId) + '</span> · ' + nodes.length + ' total items · ' + nonFolder.length + ' editable items · ~' + U.fmtNum(U.tokenEstimate(agg)) + ' tokens</div>' +
      '<div class="small" style="margin-top:6px">Folders inside: ' + nodes.filter(function (n) { return n.type === 'folder'; }).map(function (n) { return U.esc(n.title); }).join(', ') + '</div>' +
      '</div>' +
      '<div class="card"><h3>📖 Aggregated Full Text (all descendants verbatim)</h3>' +
      '<div class="small muted" style="margin-bottom:6px">This is the exact source the AI will see. Scroll to review. Every paragraph is preserved.</div>' +
      '<textarea id="baAgg" style="min-height:220px;max-height:34vh;font-family:var(--mono);font-size:12px" readonly>' + U.esc(agg) + '</textarea>' +
      '<div class="row" style="margin-top:6px"><button class="btn sm ghost" id="baCopyAgg">⧉ Copy aggregated</button><button class="btn sm ghost" id="baExpand">Expand view</button><span class="tiny muted">' + U.wordsOf(agg) + ' words</span></div>' +
      '</div>' +
      '<div class="card"><h3>📋 Project Overall Summary (context)</h3>' +
      '<div class="small muted" style="margin-bottom:6px">The AI checks this to understand the whole project before editing. Auto-generated from stats, READMEs, and health.</div>' +
      '<pre id="baSummary" style="max-height:18vh;overflow:auto;white-space:pre-wrap;font-size:11px;margin:0">' + U.esc(summary) + '</pre></div>' +
      '</div>' +
      '<div class="branch-ai-right">' +
      '<div class="card"><h3>✨ What changes would you like?</h3>' +
      '<p class="small muted">Describe how to improve this branch — e.g. “Make it more detailed in paragraphs, add examples, fix grammar, use common English, go into detail about implementation.” The AI will rewrite each item in detailed, well-written paragraphs.</p>' +
      '<textarea id="baPrompt" style="min-height:110px" placeholder="Example: Make every feature description more detailed with 2-3 paragraphs, add acceptance criteria, use clear professional English with good grammar, expand implementation notes, keep technical accuracy..."></textarea>' +
      '<div class="small" style="margin-top:8px"><strong>Output Token Size</strong> — controls how long the AI answer can be. Larger = more detail but slower and more costly. Affects how much of the branch can be expanded at once.</div>' +
      '<div class="token-grid" id="baTokens">' + tokenRadios + '</div>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="baSubmit" style="flex:1">🚀 Submit to AI — Enhance Branch</button>' +
      '<button class="btn sm ghost" id="baClear">Clear prompt</button></div>' +
      '<div id="baStatus" class="small muted" style="margin-top:8px"></div>' +
      '</div>' +
      '<div class="card" id="baResult" hidden><h3>🤖 AI Result — Detailed Paragraphs</h3><div id="baResultBody" style="max-height:38vh;overflow:auto"></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn sm primary" id="baApply" hidden>✔ Apply Updates to Tree</button>' +
      '<button class="btn sm" id="baCopyRes">⧉ Copy result</button><button class="btn sm ghost" id="baDismiss">Dismiss</button></div>' +
      '<div class="tiny muted" style="margin-top:6px">AI output is in detailed paragraphs with good grammar. If a po-patch is present, Apply will update every affected node in this branch and regenerate READMEs.</div></div>' +
      '</div></div>';

    PO.ui.modalWide('<h2>✨ AI Branch Editor — Enhance ' + U.esc(rootNode ? rootNode.title : rootId) + '</h2>', body,
      [{ label: 'Close' }]);

    // Wire token selection visual
    document.querySelectorAll('.token-opt').forEach(function (el) {
      el.onclick = function () {
        document.querySelectorAll('.token-opt').forEach(function (e) { e.classList.remove('sel'); });
        el.classList.add('sel');
        el.querySelector('input').checked = true;
      };
    });

    document.getElementById('baCopyAgg').onclick = function () { U.copyText(agg, 'Aggregated text copied'); };
    document.getElementById('baExpand').onclick = function () {
      PO.ui.modalWide('<h2>Full Aggregated Text</h2>', '<pre style="white-space:pre-wrap;max-height:70vh;overflow:auto">' + U.esc(agg) + '</pre>', [{ label: 'Close', primary: true }]);
    };
    document.getElementById('baClear').onclick = function () { document.getElementById('baPrompt').value = ''; };

    document.getElementById('baSubmit').onclick = function () { submitBranchEdit(rootId, nodes); };
    document.getElementById('baDismiss').onclick = function () { document.getElementById('baResult').hidden = true; };
    document.getElementById('baCopyRes').onclick = function () {
      var b = document.getElementById('baResultBody');
      if (b) U.copyText(b.innerText || b.textContent, 'AI result copied');
    };
  }

  function submitBranchEdit(rootId, nodes) {
    var promptText = (document.getElementById('baPrompt') || {}).value || '';
    if (!promptText.trim()) { PO.ui.toast('Describe what changes you want first.', 'warn'); return; }
    var tokEl = document.querySelector('input[name="tokSize"]:checked');
    var outTokens = tokEl ? parseInt(tokEl.value, 10) : 8000;
    var aggEl = document.getElementById('baAgg');
    var aggText = aggEl ? aggEl.value : aggregatedText(nodes, {});
    var summary = projectSummary();
    var w = W();
    var cfg = PO.ai.load();
    if (!cfg.apiKey) {
      PO.chat.openSettings();
      PO.ui.toast('Configure AI settings first — API key needed.', 'warn');
      return;
    }
    if (window.PO_SNAPSHOT_MODE) { PO.ui.toast('AI editing needs the networked app — offline snapshots have no AI.', 'warn'); return; }

    var status = document.getElementById('baStatus');
    var resultBox = document.getElementById('baResult');
    var resultBody = document.getElementById('baResultBody');
    var submitBtn = document.getElementById('baSubmit');
    var applyBtn = document.getElementById('baApply');

    status.textContent = '⏳ Contacting AI — analyzing project summary and branch content...';
    resultBox.hidden = false;
    resultBody.innerHTML = '<div class="small muted">AI is thinking… <span class="typing"><i></i><i></i><i></i></span></div>';
    submitBtn.disabled = true;
    applyBtn.hidden = true;

    // Build system prompt that emphasizes detailed paragraphs, good grammar, project summary
    var sys = [
      'You are an expert technical writer and prompt engineer for Prompt Organizer.',
      '',
      'TASK: Enhance the given branch/folder content based on user instruction.',
      '',
      'PROJECT OVERALL SUMMARY (for context — use this to keep changes coherent with the whole project):',
      summary,
      '',
      'BRANCH CONTENT TO ENHANCE (verbatim, each item has stable id):',
      aggText.slice(0, outTokens * 3), // rough char limit ~3 chars per token for input
      '',
      'USER INSTRUCTION:',
      promptText,
      '',
      'REQUIREMENTS FOR YOUR ANSWER:',
      '- State things in paragraphs, using common English with excellent grammar.',
      '- Go into detail — explain why, how, acceptance criteria, edge cases.',
      '- For each original item, produce an improved version in detailed paragraphs (2-4 paragraphs per item unless user asked otherwise).',
      '- Keep technical accuracy; do not invent requirements that conflict with project summary.',
      '- After your detailed explanation, you MUST output a ```po-patch JSON block that updates every affected node in this branch.',
      '- For a folder, update EVERY individual thing inside it — each node id that appeared in the branch content should get an update op if it was improved.',
      '- po-patch format: { "ops": [ { "op": "update", "id": "node.id", "text": "full new detailed text in paragraphs", "title": "improved title" } ] }',
      '- Text in patch must be the final, fully viewable, detailed paragraphs (not a summary of your earlier text).',
      '- Max ' + Math.min(25, nodes.filter(function (n) { return n.type !== 'folder'; }).length) + ' ops — if more than 25 nodes, pick the most important ' + Math.min(25, nodes.filter(function (n) { return n.type !== 'folder'; }).length) + ' to update now and mention remaining in your explanation.',
      '- Never delete folders; prefer update over create.',
      '',
      'OUTPUT FORMAT:',
      '1. First, a detailed, well-written explanation in paragraphs (good grammar, common English) describing what you changed and why, referencing project summary.',
      '2. Then, exactly one ```po-patch block with JSON.',
      '',
      'Remember: output token budget is ' + outTokens + ' tokens — use it to go into detail, not to be terse.'
    ].join('\n');

    var messages = [
      { role: 'system', content: sys },
      { role: 'user', content: 'Please enhance the branch ' + rootId + ' as instructed. Branch has ' + nodes.length + ' items. User wants: ' + promptText + '\n\nGo into detail, good grammar, paragraphs.' }
    ];

    var full = '';
    var abort = new AbortController();
    var t0 = Date.now();

    PO.ai.streamChat(cfg, messages, {
      onDelta: function (t) {
        full += t;
        resultBody.innerHTML = PO.chat.richHTML(full) + '<span class="typing"><i></i><i></i><i></i></span>';
        resultBody.scrollTop = resultBody.scrollHeight;
        status.textContent = '🤖 Streaming… ' + Math.ceil(full.length / 4) + ' tokens · ' + ((Date.now() - t0) / 1000).toFixed(1) + 's';
      },
      onDone: function () {
        submitBtn.disabled = false;
        resultBody.innerHTML = PO.chat.richHTML(full);
        status.textContent = '✔ Done — ' + Math.ceil(full.length / 4) + ' tokens in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's. Review below and Apply if good.';
        PO.ai.recordUsage({ provider: cfg.provider, model: cfg.model, inTok: Math.ceil((sys.length + promptText.length) / 4), outTok: Math.ceil(full.length / 4), ms: Date.now() - t0 });

        var patch = PO.ai.extractPatch(full);
        if (patch && !patch._parseError) {
          var v = PO.ai.validatePatch(patch);
          if (!v.ok) {
            status.textContent += ' — Patch invalid: ' + v.errors[0];
            resultBody.innerHTML += '<div class="patch-card bad-state"><strong>Patch invalid</strong><ul class="small">' + v.errors.map(function (e) { return '<li>' + U.esc(e) + '</li>'; }).join('') + '</ul></div>';
          } else {
            applyBtn.hidden = false;
            applyBtn.dataset.patch = JSON.stringify(patch);
            applyBtn.dataset.root = rootId;
            resultBody.innerHTML += '<div class="patch-card"><strong>Proposed updates — ' + patch.ops.length + ' items in this branch will be changed</strong>' +
              '<ul class="small" style="margin:6px 0 0 16px">' + patch.ops.map(function (o) {
                return '<li><span class="pill">update</span> ' + U.esc(o.id) + (o.title ? ' → “' + U.esc(o.title) + '”' : '') + '</li>';
              }).join('') + '</ul></div>';
            applyBtn.onclick = function () { applyBranchPatch(patch, rootId, full); };
          }
        } else {
          status.textContent += ' — No po-patch found. You can copy the detailed paragraphs and apply manually.';
          if (patch && patch._parseError) {
            resultBody.innerHTML += '<div class="patch-card bad-state">Patch parse error: ' + U.esc(patch._parseError) + '</div>';
          }
        }
      }
    }, abort.signal).catch(function (err) {
      submitBtn.disabled = false;
      status.textContent = '✖ Error: ' + (err.message || err);
      resultBody.innerHTML += '<div class="patch-card bad-state">⚠ ' + U.esc(err.message || String(err)) + '</div>';
    });
  }

  function applyBranchPatch(patch, rootId, fullText) {
    var r = PO.ai.applyPatch(patch, 'branch-editor');
    var updatedIds = r.applied.map(function (a) { return a.id; });
    // Touch parents to regenerate READMEs for folder
    var w = W();
    if (w.nodes[rootId]) PO.readme.touchParents(w, rootId);
    updatedIds.forEach(function (id) { if (w.nodes[id]) PO.readme.touchParents(w, id); });
    PO.store.persist();
    PO.ui.render();
    PO.ui.closeModal();
    PO.ui.toast('Applied ' + r.applied.length + ' updates to branch ' + rootId + ' — every affected item inside folder updated. ' + (r.skipped.length ? r.skipped.length + ' skipped.' : ''), 'ok');
    // Show summary modal with updated items fully viewable
    var summary = '<p>Updated ' + r.applied.length + ' item(s) in branch <strong>' + U.esc(rootId) + '</strong>. Each change is versioned and fully viewable in Node view and in the full-text viewer.</p>' +
      '<div class="card" style="max-height:40vh;overflow:auto"><h3>Updated items — full text viewable</h3>' +
      updatedIds.map(function (id) {
        var n = w.nodes[id];
        if (!n) return '';
        return '<div class="card" style="margin-bottom:8px"><strong>' + U.esc(n.title) + '</strong> <span class="mono tiny">' + U.esc(id) + '</span><pre style="white-space:pre-wrap;margin:6px 0 0">' + U.esc(n.text) + '</pre></div>';
      }).join('') + '</div>' +
      '<p class="small muted">All changes also visible via right-click → View Full Text on the tree.</p>';
    PO.ui.modalWide('<h2>✔ Branch Enhanced — ' + U.esc(rootId) + '</h2>', summary, [{ label: 'Close', primary: true }]);
  }

  /* ---------- Context Menu ---------- */
  var ctxMenu = null;
  function showContextMenu(x, y, nodeId) {
    hideContextMenu();
    var w = W();
    var n = w.nodes[nodeId];
    if (!n) return;
    var isFolder = n.type === 'folder';
    var kids = PO.analyze.childrenOf(w, nodeId).length;
    var html =
      '<div class="ctx-menu" style="left:' + x + 'px;top:' + y + 'px">' +
      '<div class="ctx-head">' + PO.ui.typeIcon(n.type) + ' ' + U.esc(n.title) + ' <span class="mono tiny">' + U.esc(nodeId) + '</span></div>' +
      '<button data-act="view"><span>📖</span> View Full Text — ' + (isFolder ? 'entire branch (' + (kids + 1) + ' items)' : 'this item') + '</button>' +
      '<button data-act="ai"><span>✨</span> AI Enhance Branch — detailed paragraphs</button>' +
      '<button data-act="copy"><span>⧉</span> Copy Full Text</button>' +
      '<button data-act="copyId"><span>🆔</span> Copy ID</button>' +
      '<hr>' +
      '<button data-act="rename"><span>✎</span> Quick Rename</button>' +
      '<button data-act="dup"><span>⧉</span> Duplicate</button>' +
      '<button data-act="fav"><span>' + (w.favorites.indexOf(nodeId) >= 0 ? '★' : '☆') + '</span> ' + (w.favorites.indexOf(nodeId) >= 0 ? 'Unfavorite' : 'Favorite') + '</button>' +
      '<button data-act="recomp"><span>🧩</span> Recompile Subtree</button>' +
      (isFolder ? '<button data-act="color"><span>🎨</span> Set Folder Color</button>' : '') +
      '</div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    var menu = div.firstChild;
    document.body.appendChild(menu);
    ctxMenu = menu;

    menu.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () {
        var act = b.dataset.act;
        hideContextMenu();
        if (act === 'view') openFullTextViewer(nodeId);
        else if (act === 'ai') openBranchEditor(nodeId);
        else if (act === 'copy') {
          var nodes = collectBranch(nodeId);
          var txt = aggregatedText(nodes, { includeFolders: true });
          U.copyText(txt, 'Full text copied');
        } else if (act === 'copyId') { U.copyText(nodeId, 'ID copied'); }
        else if (act === 'rename') { PO.ui.openNodeEditModal(nodeId); }
        else if (act === 'dup') { duplicateNode(nodeId); }
        else if (act === 'fav') {
          var i = w.favorites.indexOf(nodeId);
          if (i >= 0) w.favorites.splice(i, 1); else w.favorites.push(nodeId);
          PO.store.touch(); PO.store.persist(); PO.ui.render();
        } else if (act === 'recomp') {
          PO.ui.state.recomp.root = nodeId;
          PO.ui.setTab('recompile');
        } else if (act === 'color') {
          if (PO.pro && PO.pro.openFolderColor) PO.pro.openFolderColor(nodeId);
        }
      };
    });

    setTimeout(function () {
      document.addEventListener('click', hideContextMenu);
      document.addEventListener('contextmenu', hideContextMenu);
    }, 10);
  }
  function hideContextMenu() {
    if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    document.removeEventListener('click', hideContextMenu);
    document.removeEventListener('contextmenu', hideContextMenu);
  }

  function duplicateNode(nodeId) {
    var w = W();
    var n = w.nodes[nodeId];
    if (!n) return;
    var nid = PO.ingest.makeId(w, n.type, n.title + ' copy');
    var t = U.nowISO();
    w.nodes[nid] = Object.assign({}, n, { id: nid, title: n.title + ' (copy)', created: t, updated: t, ver: 1, mergedFrom: [] });
    PO.store.log('duplicate', 'Duplicated ' + nodeId + ' → ' + nid, nid);
    PO.store.touch(); PO.store.persist(); PO.ui.render();
    PO.ui.toast('Duplicated to ' + nid, 'ok');
  }

  /* ---------- Tree wiring augmentation ---------- */
  function wireTreeEnhancements(host) {
    if (!host) return;
    host.querySelectorAll('.trow').forEach(function (row) {
      var nid = row.dataset.nid;
      if (!nid) return;
      // add inline AI button on hover (if not already)
      if (!row.querySelector('.trow-ai')) {
        var btn = document.createElement('button');
        btn.className = 'btn sm ghost trow-ai';
        btn.title = '✨ AI Enhance — view full text & rewrite with detailed paragraphs';
        btn.innerHTML = '✨';
        btn.dataset.nid = nid;
        btn.onclick = function (ev) {
          ev.stopPropagation();
          openBranchEditor(nid);
        };
        row.appendChild(btn);
      }
      // right-click
      row.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
        showContextMenu(ev.clientX, ev.clientY, nid);
      });
    });
  }

  // Hook into ui.render to augment tree after each render
  var _origRender = null;
  function install() {
    if (PO.ui && PO.ui.render && !_origRender) {
      _origRender = PO.ui.render;
      PO.ui.render = function () {
        _origRender.apply(this, arguments);
        // after render, enhance tree if present
        setTimeout(function () {
          var tb = document.getElementById('treeBox');
          if (tb) wireTreeEnhancements(tb);
          // also any tree in modals (recompile picker)
          var rt = document.getElementById('rcTree');
          if (rt) wireTreeEnhancements(rt);
        }, 0);
      };
    }
  }

  PO.branchAI = {
    openFullTextViewer: openFullTextViewer,
    openBranchEditor: openBranchEditor,
    collectBranch: collectBranch,
    aggregatedText: aggregatedText,
    TOKEN_OPTIONS: TOKEN_OPTIONS,
    wireTreeEnhancements: wireTreeEnhancements,
    install: install
  };

  // auto-install when ui ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else setTimeout(install, 300);
})();
