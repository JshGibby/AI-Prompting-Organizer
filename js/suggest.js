/* ============================================================
   Prompt Organizer — suggest.js
   30 premade tips for getting the most out of your workspace.
   6 shown at a time; the set auto-rotates every 2 minutes and
   you can shuffle instantly. Each tip is an action, not ad copy.
   ============================================================ */
(function () {
  'use strict';

  var TIPS = [
    ['Paste a huge prompt', 'Hit ＋ Prompt and paste anything — 5 words or 50,000. Nothing is summarized; every paragraph is kept verbatim and gets its own card.'],
    ['Trust the Inbox', 'Items the organizer wasn\'t sure about land in 🕳 Inbox (needs review) — they\'re never thrown away. Clear it from the Review Queue.'],
    ['Read the health score', 'The Dashboard\'s big number folds six quality checks into one score. Click any factor to see exactly what\'s dragging it down.'],
    ['Let the AI explain', '💬 AI Chat answers questions about YOUR workspace with node ids cited. "What am I missing?" is a great first question.'],
    ['Recompile a subtree', '🧩 Recompile turns any folder back into a clean prompt with a token budget — and proves nothing was lost with a no-loss diff.'],
    ['Test like a pro', '🕘 → 🧪 Test cases: give a prompt version expected outputs and score real model runs against them. Find your best version.'],
    ['Hunt negative space', '🔗 → 🕳 Gaps spots what your spec implies but never says — like login without logout. One click adds it as an idea.'],
    ['Star favorites', 'In Search, star the nodes you return to daily. They pin to the top of the Recent panel.'],
    ['Save your queries', 'Run a search, hit ⭐ save, and reuse the exact filter combo anytime from 🔎 → Saved queries.'],
    ['Pin two views', '📌 Pin on Tree, Graph, or Node keeps them side-by-side with the main tab — compare a script against its feature.'],
    ['Keyboard is faster', 'Ctrl+1..9 for main tabs (Guide is Ctrl+9), Alt+1..9 for side tabs, [ and ] to walk the tree, / to search, G/T/D for Guide/Tree/Dashboard.'],
    ['Merge, don\'t delete', 'Review Queue detects near-duplicates and offers ⧉ Merge — the audit trail records what was combined and why.'],
    ['Stale = check me', 'When a topic changes, everything depending on it gets a ⚠ stale flag with a reason. The Review Queue collects them.'],
    ['Read folder READMEs', '📚 READMEs generates an explanation for every folder — root README explains the whole project. Regenerates on change.'],
    ['Use deep links', 'Every view has a shareable #/tab/node link. Bookmark "your" view and it reopens exactly there.'],
    ['Ask before you edit', 'Let AI Chat draft changes as a reviewable patch. You approve each op — nothing applies silently.'],
    ['Keep scripts testable', '💻 Scripts extracts code fences automatically. Use ✎ Edit to refine, and links show which feature each script implements.'],
    ['Link requirements', '🔗 Traceability shows which requirements have no implementing feature — coverage gaps are where specs go to die.'],
    ['Watch the AI meter', 'AI Chat shows a context-window meter before you send. Trim history or start fresh when the bar creeps up.'],
    ['Free AI models', 'The ⚙ AI settings panel lists each free model\'s context window and quota (Groq, Gemini, OpenRouter :free, Cerebras) — plus fully local Ollama/LM Studio.'],
    ['Check the Issues tab', 'Every error the app hits lands in ⚠ Issues with a copy button — plus automatic workspace health checks.'],
    ['Snapshots are safety nets', '⤓ Offline snapshot bundles everything into one HTML file that works from a USB stick — no network, no AI.'],
    ['Version everything', 'Every edit — human or AI — writes a version entry with before/after diffs in 🕘 History.'],
    ['Compact mode for laptops', '⚙ → Spacing: Compact fits more on screen. Text size slider helps on big monitors.'],
    ['Pick your vibe', 'Six themes in ⚙ — Ocean, Forest, Sunset, Candy, Paper, or classic Midnight. Works offline.'],
    ['Calm mode', '⚙ → Animations: Calm removes motion app-wide — great for screen recording or motion sensitivity.'],
    ['Drag to re-parent', 'Tree rows AND graph nodes drag onto new parents. Cycles are prevented; edges update automatically.'],
    ['Mind map any node', 'Graph → 🧠 Mind map radiates from your current selection — a quick 14-branch overview of any subtree.'],
    ['Glossary writes itself', '📚 → Glossary and Acronyms extract terms and abbreviations from your text with the nodes that define them.'],
    ['Export ZIP for teammates', '⤓ ZIP includes README.md, per-folder readmes, graph.json and a manifest — a whole project in one file.']
  ];

  var LS_KEY = 'po.suggest.v1';
  var state = { offset: 0, last: 0, timer: null, paused: false };

  function loadState() {
    try { var s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); if (typeof s.offset === 'number') state.offset = s.offset; } catch (e) { /* fresh */ }
  }
  function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify({ offset: state.offset })); } catch (e) { /* ok */ } }

  function window6() {
    var out = [];
    for (var i = 0; i < 6; i++) out.push(TIPS[(state.offset + i) % TIPS.length]);
    return out;
  }

  function html() {
    var six = window6();
    return '<div class="suggest-bar"><div class="suggest-head"><span class="suggest-dot"></span><strong>Ways to work smarter</strong>' +
      '<span class="flex-spacer"></span>' +
      '<button class="btn sm ghost" data-sug="pause" title="' + (state.paused ? 'Resume rotating' : 'Pause rotating') + '">' + (state.paused ? '▶' : '⏸') + '</button>' +
      '<button class="btn sm ghost" data-sug="shuffle" title="Show the next six">↻ shuffle</button></div>' +
      '<div class="suggest-grid">' + six.map(function (t, i) {
        return '<div class="suggest-card" data-sug-open="' + i + '" role="button" tabindex="0" title="Click for details">' +
          '<div class="suggest-title">' + esc(t[0]) + '</div>' +
          '<div class="suggest-body">' + esc(t[1]) + '</div></div>';
      }).join('') + '</div></div>';
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function mount(el, POui) {
    loadState();
    startTimer();
    draw(el, POui);
  }

  function draw(el, POui) {
    el.innerHTML = html();
    el.querySelectorAll('[data-sug]').forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.sug === 'shuffle') next(POui);
        else { state.paused = !state.paused; draw(el, POui); }
      };
    });
    el.querySelectorAll('[data-sug-open]').forEach(function (card) {
      function open() {
        var t = window6()[+card.dataset.sugOpen];
        if (!POui || !POui.modal) return;
        POui.modal('<h2>💡 ' + esc(t[0]) + '</h2>', '<p>' + esc(t[1]) + '</p>' +
          '<p class="tiny muted">Tip ' + ((state.offset + +card.dataset.sugOpen) % TIPS.length + 1) + ' of ' + TIPS.length + ' · rotates every 2 min unless paused</p>',
          [{ label: 'Got it', primary: true }]);
      }
      card.onclick = open;
      card.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  }

  function next(POui) {
    state.offset = (state.offset + 6) % TIPS.length;
    persist();
    var els = document.querySelectorAll('[data-suggest-root]');
    els.forEach(function (el) { draw(el, POui || (window.PO && PO.ui)); });
  }

  function startTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(function () {
      if (state.paused || document.hidden) return;
      next();
    }, 120000);
  }

  window.PO = window.PO || {};
  PO.suggest = { mount: mount, next: next, html: html, TIPS: TIPS, window: window6, pause: function (p) { state.paused = p; } };
})();
