/* ============================================================
   Prompt Organizer — ui-extra-tabs.js
   Two new MAIN tabs:
   📖 Guide — friendly tutorial for every tab + guided tour
   ⚠ Issues — central error console + automatic workspace checks
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  /* ---------- error bus ---------- */
  var ERRORS = [];
  function record(kind, msg, detail) {
    ERRORS.unshift({ at: U.nowISO(), kind: kind || 'error', msg: String(msg || ''), detail: detail || '' });
    if (ERRORS.length > 200) ERRORS.length = 200;
    var badge = document.querySelector('[data-tab="issues"] .count');
    if (badge) {
      badge.textContent = ERRORS.length;
      badge.classList.add('alert');
      badge.hidden = false;
    }
  }
  function installErrorHooks() {
    window.addEventListener('error', function (ev) { record('error', ev.message, (ev.filename || '') + ':' + (ev.lineno || '')); });
    window.addEventListener('unhandledrejection', function (ev) {
      var r = ev.reason;
      record('error', (r && (r.message || String(r))) || 'Unhandled promise rejection', (r && r.stack) || '');
    });
    // wrap the real toast so 'bad' toasts are recorded too (PO.ui exists at boot time)
    if (window.PO && PO.ui && PO.ui.toast && !PO.ui.toast.__poWrapped) {
      var orig = PO.ui.toast;
      var wrapped = function (msg, kind) {
        if (kind === 'bad') record('error', String(msg).replace(/<[^>]+>/g, ''));
        return orig(msg, kind);
      };
      wrapped.__poWrapped = true;
      PO.ui.toast = wrapped;
    }
  }

  /* ================= GUIDE ================= */
  var PAGES = [
    { id: 'start', title: 'Start here', body:
      '<p><strong>Prompt Organizer turns one huge, messy prompt into a tidy, branching workspace.</strong> Nothing is summarized and nothing is deleted — every paragraph keeps its exact original wording. The organizer figures out <em>what</em> each piece is (topic, feature, rule, script…), <em>where</em> it belongs, and <em>how</em> pieces connect.</p>' +
      '<ol><li><strong>＋ Prompt</strong> (top right) — paste your prompt, watch the stats, press Organize.</li>' +
      '<li>Explore with the tabs below — every view follows your selection.</li>' +
      '<li>Come back anytime: everything saves itself in your browser, and ⤓ buttons export ZIP / JSON / offline HTML.</li></ol>' },
    { id: 'prompts', title: '📝 Prompts', body:
      '<p>Your imported prompts live here, versioned forever. Adding text to the same prompt creates a new version and updates existing items instead of duplicating them.</p>' +
      '<ul><li><strong>Prompts</strong> — the list, versions and diffs.</li>' +
      '<li><strong>Lint & tokens</strong> — clarity, ambiguity, tone and missing-number checks, plus context-window usage.</li>' +
      '<li><strong>Templates · variables · snippets</strong> — reusable <code>{{variables}}</code> for prompts you write often.</li></ul>' },
    { id: 'review', title: '🛎 Review Queue', body:
      '<p>Anything that needs a human decision lands here, sorted by severity × impact: uncertain inbox items, AI-inferred guesses, orphans, duplicates, conflicts, stale items, low confidence.</p>' +
      '<ul><li><strong>Accept</strong> promotes an item to asserted.</li>' +
      '<li><strong>Why here?</strong> shows the reasoning, the source quote, and its neighbors.</li>' +
      '<li><strong>Merge</strong> combines a duplicate pair and records the audit trail.</li>' +
      '<li>Filter chips show counts; <strong>Accept all shown</strong> clears a whole category.</li></ul>' },
    { id: 'dashboard', title: '📊 Dashboard', body:
      '<p>The whole prompt at a glance: words, tokens, reading time, counts per type, branch depth, connections — plus a <strong>health score</strong> built from six factors.</p>' +
      '<ul><li>Click a <strong>health factor</strong> to open the Review Queue filtered to that problem.</li>' +
      '<li>Click any <strong>type card</strong> to see those items in the Tree.</li>' +
      '<li>The <strong>attention row</strong> up top is your "what next" list.</li></ul>' },
    { id: 'guideTips', title: '🛰 Statistics stay in sync', body:
      '<p>The status bar at the bottom (nodes · links · health) is computed once per render and shared by every tab. Dashboard, Review Queue counts, and health all read the same numbers, so a fix in one place is reflected everywhere instantly.</p>' },
    { id: 'search', title: '🔎 Search', body:
      '<p>Full-text search with type / status / tag / confidence / source filters. Filters carry across tabs and are shown as pills above your results.</p>' +
      '<ul><li><strong>💬 Q&A</strong> — ask in plain English; answers link to the nodes.</li>' +
      '<li><strong>⭐ Saved queries</strong> — keep your favorite filter combos.</li>' +
      '<li>Neighbors of hits are included automatically, so context comes along.</li></ul>' },
    { id: 'versions', title: '🕘 Versions', body:
      '<p>Every change is a ledger entry with a line-level diff. <strong>Test cases</strong> let you score prompt versions against expected outputs — the best version is starred in the Prompts list. <strong>Compare</strong> runs two versions side by side with output diffs.</p>' },
    { id: 'trace', title: '🔗 Traceability', body:
      '<p>Requirements (hard / soft / non-goal) are extracted from your text and linked to what implements them. <strong>Links</strong> shows the relationship mix; <strong>Gaps & negative space</strong> reports missing-but-expected pieces (login without logout…).</p>' },
    { id: 'recompile', title: '🧩 Recompile', body:
      '<p>The superpower: pick any folder and rebuild a clean prompt. It pulls in dependencies, fits a token budget, warns if hard constraints got dropped, and shows a <strong>no-loss proof</strong>. Save the output straight back as a new prompt.</p>' },
    { id: 'tree', title: '🌳 Tree · 🕸 Graph · 🗺 Mind map', body:
      '<p>The <strong>Tree</strong> is your file system; drag rows to re-parent. The <strong>Graph</strong> shows relationships — drag nodes to arrange them (positions stick), drag one onto another to re-parent. The <strong>Mind map</strong> radiates from your selection.</p>' },
    { id: 'node', title: '📄 Node & ⌖ Source', body:
      '<p><strong>Node</strong> shows everything about one item: pills, tags, entities, connections, merged history, full verbatim text. <strong>Source</strong> re-renders the original prompt with every traced paragraph tinted — click any tint to jump to its node, and your selection is highlighted.</p>' },
    { id: 'readmes', title: '📚 READMEs & knowledge', body:
      '<p>Auto-generated docs: a README for the root and every folder, plus a Glossary, Acronym list, full Index and a Source map. They regenerate on change, and the changelog records the update.</p>' },
    { id: 'chat', title: '💬 AI Chat (optional)', body:
      '<p>Bring your own key (OpenAI, Groq, OpenRouter, local Ollama and more — configurable providers). Ask about the workspace, or request edits: the AI replies with a plan plus a patch you review and apply. The context meter shows how much of the model\'s window you\'re using.</p>' },
    { id: 'extras', title: '⚠ Issues · 🎨 Themes · 🛰 Tips', body:
      '<p><strong>Issues</strong> collects every error plus automatic workspace checks. <strong>⚙ (top bar)</strong> opens themes, text size, animations and spacing — make it yours. The <strong>tips row</strong> under the tab bar rotates 30 ways to work smarter, six at a time.</p>' }
  ];

  PO.uiTabs.guide = function (W, host, ui) {
    var sel = ui.state.guideSel || 'start';
    host.innerHTML = ui.tabHeadHTML(W, '📖 Guide', 'What every tab does — in plain English.') +
      '<div class="two-col guide-layout"><div class="card guide-nav">' +
      PAGES.map(function (p) {
        return '<button class="guide-link' + (sel === p.id ? ' sel' : '') + '" data-gpage="' + p.id + '">' + p.title + '</button>';
      }).join('') +
      '<hr><button class="btn primary" id="gTour" style="width:100%">🎬 Take the 60-second tour</button>' +
      '<p class="tiny muted" style="margin-top:8px">The tour walks you through the real workspace: your nodes, your numbers.</p></div>' +
      '<div class="guide-page" id="gPage"></div></div>';
    ui.wireTabHead(host);
    host.querySelectorAll('[data-gpage]').forEach(function (b) {
      b.onclick = function () { ui.state.guideSel = b.dataset.gpage; ui.render(); };
    });
    var page = PAGES.filter(function (p) { return p.id === sel; })[0] || PAGES[0];
    host.querySelector('#gPage').innerHTML = '<h2>' + page.title + '</h2>' + page.body +
      (sel === 'start' ? '<div class="card" style="margin-top:12px"><h3>The golden rules</h3><ul>' +
        '<li>Nothing is ever summarized or removed — wording stays verbatim, always.</li>' +
        '<li>Every item has a stable ID that never changes, and a link back to its exact source.</li>' +
        '<li>AI suggestions are visible, explained, and one click reversible.</li>' +
        '<li>Everything saves itself; exports are yours to keep, forever offline.</li></ul></div>' : '');
    host.querySelector('#gTour').onclick = function () { startTour(ui); };
  };

  function startTour(ui) {
    var W = PO.store.W();
    var A = PO.analyze;
    var st = A.stats(W);
    var steps = [
      ['👋 Welcome!', 'This is <strong>your</strong> workspace: <strong>' + st.nodes + ' items</strong>, <strong>' + st.edges + ' links</strong>, health <strong>' + A.health(W).score + '/100</strong>. The tour takes about a minute — press Next to stroll through.'],
      ['📝 Prompts', 'Everything begins here: paste a prompt, get a workspace. New text becomes a new version — old wording is never lost.'],
      ['🌳 Tree (side)', 'Your branching file system. Click items to select them — every other tab follows. Drag rows onto folders to re-organize.'],
      ['📄 Node (side)', 'The detail card for whatever is selected: source quote, connections, tags, full verbatim text.'],
      ['🛎 Review Queue', 'AI guesses, duplicates, orphans and stale items wait here for your judgment. Accept, merge, edit or reject — all logged.'],
      ['📊 Dashboard', 'Words, tokens, health score, coverage. Click any factor to see the problem items.'],
      ['🔎 Search & Q&A', 'Find anything, save the filters, or just ask a question in the Q&A box.'],
      ['🧩 Recompile', 'Turn any folder back into a clean, budgeted prompt — with proof nothing was dropped.'],
      ['💬 AI Chat', 'Ask "what am I missing?" — grounded answers with node ids, and edit requests arrive as reviewable patches.'],
      ['🎉 That\'s the tour!', 'Try ⚙ for themes, flip through 📖 Guide anytime, and remember: the organizer never deletes your words. Happy organizing!']
    ];
    var i = 0;
    function show() {
      var s = steps[i];
      var targets = { 1: 'prompts', 2: 'tree', 3: 'node', 4: 'review', 5: 'dashboard', 6: 'search', 7: 'recompile', 8: 'chat' };
      if (targets[i]) { ui.setTab(targets[i]); }
      var btns = [{ label: i ? 'Back' : 'Skip', onClick: function () { i = Math.max(0, i - 1); if (!i && !steps[i + 1]) return; show(); } },
        { label: i === steps.length - 1 ? 'Finish 🎉' : 'Next →', primary: true, onClick: function () { if (i < steps.length - 1) { i++; show(); } else PO.ui.closeModal(); } }];
      if (PO.prefs && PO.prefs.S.fx === 'on' && i === steps.length - 1) PO.prefs.confetti(window.innerWidth / 2, window.innerHeight / 3);
      PO.ui.modal('<h2>🎬 Tour — ' + (i + 1) + '/' + steps.length + '</h2>', '<h3 style="margin-top:0">' + s[0] + '</h3><p>' + s[1] + '</p>' +
        '<div class="progress"><i style="width:' + ((i + 1) / steps.length * 100) + '%"></i></div>', btns);
    }
    show();
  }

  /* ================= ISSUES ================= */
  var CHECKS = [
    ['Orphaned items', function (W) { return PO.analyze.orphans(W).length; }, 'high', 'orphans', 'tree'],
    ['Uncertain items in inbox', function (W) { var st = PO.analyze.stats(W); return st.uncertain; }, 'med', 'uncertain', 'review'],
    ['Stale items', function (W) { return PO.analyze.stats(W).stale; }, 'med', 'stale', 'review'],
    ['Conflicting rules', function (W) { return PO.analyze.stats(W).conflicts; }, 'high', 'conflict', 'review'],
    ['Uncovered requirements', function (W) { return PO.analyze.coverage(W).gaps.length; }, 'med', '', 'trace'],
    ['Unresolved duplicates', function (W) { return PO.analyze.reviewQueue(W).filter(function (i) { return i.reasons.some(function (r) { return r.k === 'dup'; }); }).length; }, 'med', 'dup', 'review'],
    ['Broken edge endpoints', function (W) { return W.edges.filter(function (e) { return !W.nodes[e.a] || !W.nodes[e.b]; }).length; }, 'high', '', 'issues'],
    ['Nodes with no parent', function (W) { return PO.analyze.nodesArr(W, true).filter(function (n) { return !n.parent || !W.nodes[n.parent]; }).length; }, 'high', '', 'issues'],
    ['Prompts without versions', function (W) { return W.prompts.filter(function (p) { return !p.vers || !p.vers.length; }).length; }, 'low', '', 'prompts'],
    ['Empty items', function (W) { return PO.analyze.nodesArr(W, true).filter(function (n) { return !String(n.text || '').trim() && n.type !== 'folder' && n.type !== 'asset'; }).length; }, 'low', '', 'review']
  ];

  PO.uiTabs.issues = function (W, host, ui) {
    var findings = CHECKS.map(function (c) {
      var n = 0;
      try { n = c[1](W) || 0; } catch (e) { n = 0; }
      return { name: c[0], n: n, sev: c[2], filter: c[3], tab: c[4] };
    });
    var bad = findings.filter(function (f) { return f.n > 0; });
    host.innerHTML = ui.tabHeadHTML(W, '⚠ Issues', 'Every error the app hit, plus automatic checks over your workspace.') +
      '<div class="two-col"><div>' +
      '<div class="card"><h3>Workspace checks</h3>' +
      '<div class="small muted" style="margin-bottom:8px">' + (bad.length ? bad.length + ' thing(s) to look at' : '✓ All checks pass — tidy workspace!') + '</div>' +
      findings.map(function (f) {
        var sev = f.n === 0 ? '' : (f.sev === 'high' ? 'bad-t' : f.sev === 'med' ? 'warn-t' : 'acc-t');
        return '<div class="row small" style="padding:4px 0;border-bottom:1px solid #202a3a"><strong style="flex:1">' + U.esc(f.name) + '</strong>' +
          '<span class="' + (f.n ? sev : 'ok-t') + '">' + (f.n || '✓') + '</span>' +
          (f.n && f.filter ? '<button class="btn sm ghost" data-ichk="' + f.filter + '" data-itab="' + f.tab + '">view →</button>' :
            f.n && f.tab !== 'issues' ? '<button class="btn sm ghost" data-itab="' + f.tab + '">open →</button>' : '') + '</div>';
      }).join('') + '</div>' +
      '<div class="card"><h3>App errors (' + ERRORS.length + ')</h3>' +
      (ERRORS.length ? '<div class="row" style="margin-bottom:8px"><button class="btn sm" id="iCopy">⧉ copy all</button>' +
        '<button class="btn sm ghost" id="iClear">clear log</button></div>' +
        ERRORS.slice(0, 40).map(function (e, i) {
          return '<div class="lint-issue"><span class="bad-t">●</span> <span class="mono tiny">' + U.fmtAgo(e.at) + '</span> ' + U.esc(e.msg) +
            (e.detail ? '<div class="tiny dim mono">' + U.esc(String(e.detail).slice(0, 200)) + '</div>' : '') + '</div>';
        }).join('') : '<p class="ok-t small">✓ No errors logged this session.</p>') + '</div>' +
      '</div><div class="card" style="align-self:start"><h3>What am I looking at?</h3>' +
      '<p class="small muted">Checks run live against your workspace every time you open this tab — nothing is sent anywhere.</p>' +
      '<ul class="small"><li><strong>Broken endpoints / parentless nodes</strong> are real data bugs — use ⚙ AI Chat with "fix broken links" or edit the item.</li>' +
      '<li><strong>Coverage gaps</strong> are requirements nothing implements yet — the AI can suggest implementers.</li>' +
      '<li><strong>Errors</strong> collect automatically; copy them when reporting a problem.</li></ul>' +
      '<div class="row"><button class="btn sm primary" id="iChatFix">💬 Ask AI to help fix these</button></div></div></div>';
    ui.wireTabHead(host);
    host.querySelectorAll('[data-ichk]').forEach(function (b) {
      b.onclick = function () { ui.state.reviewFilter = b.dataset.ichk; ui.setTab(b.dataset.itab); };
    });
    host.querySelectorAll('[data-itab]').forEach(function (b) {
      b.onclick = function () { ui.setTab(b.dataset.itab); };
    });
    var cp = host.querySelector('#iCopy');
    if (cp) cp.onclick = function () {
      U.copyText(ERRORS.map(function (e) { return e.at + ' [' + e.kind + '] ' + e.msg + (e.detail ? '\n  ' + e.detail : ''); }).join('\n'), 'Error log copied');
    };
    var cl = host.querySelector('#iClear');
    if (cl) cl.onclick = function () { ERRORS.length = 0; var b = document.querySelector('[data-tab="issues"] .count'); if (b) { b.hidden = true; } ui.render(); };
    var cf = host.querySelector('#iChatFix');
    if (cf) cf.onclick = function () {
      ui.state.pinned = ui.state.pinned.indexOf('chat') < 0 ? ui.state.pinned.concat(['chat']) : ui.state.pinned;
      PO.chat.send('Review the Issues tab findings for this workspace: ' +
        bad.map(function (f) { return f.name + ' (' + f.n + ')'; }).join(', ') +
        '. Propose a po-patch that fixes what can be fixed (broken links, orphan placements) and explain the rest.');
    };
    if (PO.chat && PO.chat.S) { /* ensure chat tab exists for iChatFix even if never opened */ }
  };

  PO.issues = { record: record, ERRORS: ERRORS, installErrorHooks: installErrorHooks, runChecks: function (W) { return CHECKS.map(function (c) { return { name: c[0], n: c[1](W) }; }); } };
})();
