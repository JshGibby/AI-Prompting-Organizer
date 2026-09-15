/* ============================================================
   Prompt Organizer — ui-chat.js
   💬 AI Chat side tab: chat with an AI that knows this workspace
   and can apply structured edits (po-patch) with full audit trail.

   Bring-your-own-key: settings are per browser (localStorage),
   default provider is OpenAI; any OpenAI-compatible endpoint works.
   Configuration preserved, no free-model references.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  var S = { msgs: [], busy: false, abort: null, sub: 'chat', ctxCount: 0, showUsage: false };

  function ctxState() {
    var c = cfg();
    var tok = 900;
    S.msgs.forEach(function (m) { tok += Math.ceil(((m.text || m.plain || '').length) / 4); });
    var limit = PO.ai.contextLimit(c);
    return { tok: tok, limit: limit, pct: Math.min(100, Math.round(tok / limit * 100)) };
  }

  function W() { return PO.store.W(); }
  function cfg() { return PO.ai.load(); }

  window.PO = window.PO || {};
  window.PO.uiTabs = window.PO.uiTabs || {};
  PO.uiTabs.chat = function (W, host, ui, opts) {
    var c = cfg();
    var pinned = opts && opts.pinned;
    var cs = ctxState();
    var meter = '<div class="ctx-meter" title="Tokens this chat would send vs the ' + cs.limit.toLocaleString() + '-token context window of ' + U.esc(c.model || 'the model') + '">' +
      '<span class="tiny muted">ctx</span><div class="ctx-bar"><i style="width:' + cs.pct + '%" class="' + (cs.pct > 85 ? 'hot' : cs.pct > 60 ? 'warm' : '') + '"></i></div>' +
      '<span class="tiny">' + U.fmtNum(cs.tok) + ' / ' + U.fmtNum(cs.limit) + '</span>' +
      (cs.pct > 60 ? '<button class="btn sm ghost" data-trim title="Drop the oldest half of the conversation to free context">✂ trim</button>' : '') +
      '</div>';
    host.innerHTML =
      '<div class="chat-wrap">' +
      '<div class="toolbar" style="margin-bottom:8px">' +
      '<div style="flex:1;min-width:0"><h2 style="margin:0">💬 ' + (pinned ? 'AI Chat' : 'Ask & Apply') + '</h2>' +
      '<div class="small muted">' + (c.provider ? PO.ai.presets()[c.provider].label : 'Not configured') +
      ' · ' + U.esc(c.model || 'no model') + (ui.state.nodeId ? ' · ◉ ' + U.esc(ui.state.nodeId) : ' · no selection') + '</div></div>' +
      '<button class="btn sm ghost" id="chatStats" title="Tokens, messages, speed — counted in this browser only">📊</button>' +
      '<button class="btn sm ghost" id="chatSettings" title="API keys stay in your browser">⚙ AI settings</button>' +
      '<button class="btn sm ghost" id="chatClear" title="Clear this chat session">🗑</button>' +
      '</div>' +
      '<div class="chat-scroll" id="chatScroll"></div>' +
      '<div class="chat-actions" id="chatActions"></div>' +
      '<div class="chat-composer"><textarea id="chatInput" rows="2" ' +
      'placeholder="Ask about this workspace, or tell the AI what to change — e.g. “add a rule that sessions expire after 30 min and link it to the login feature”"></textarea>' +
      '<div class="chat-send"><button class="btn primary" id="chatSend">Send ⏎</button>' +
      (S.busy ? '<button class="btn" id="chatStop">■ Stop</button>' : '') + '</div></div>' +
      meter +
      '<div class="tiny muted chat-privacy">' +
      (PO.ai.isLocal(c.provider) ? '🖥 Local model — nothing leaves your machine.' : 'Key + chat stay in your browser except to your chosen provider') +
      ' · AI edits are versioned & reversible (see 🕘 Versions) · history clears on reload</div>' +
      '</div>';

    drawMessages(host, ui);
    drawActions(host);
    wire(host, ui);
    if (!pinned) setTimeout(function () { var ta = U.$('chatInput'); if (ta) ta.focus(); }, 60);
  };

  function drawMessages(host, ui) {
    var box = host.querySelector('#chatScroll');
    if (!S.msgs.length) {
      box.innerHTML = '<div class="empty" style="margin-top:8px"><div style="font-size:22px">💬</div>' +
        '<strong>Chat with your workspace.</strong><br>' +
        'Ask what a node means, hunt for gaps and conflicts, or ask the AI to make an edit —<br>' +
        'edits arrive as reviewable patches and are applied with a changelog entry + version.<br>' +
        '<span class="tiny muted">First time? Click ⚙ AI settings and paste your API key.</span></div>';
      return;
    }
    box.innerHTML = S.msgs.map(function (m, i) { return bubbleHTML(m, i); }).join('');
    wireBubbles(host, ui);
    box.scrollTop = box.scrollHeight;
  }

  function bubbleHTML(m, i) {
    var who = m.role === 'user' ? 'You' : 'AI';
    var cls = m.role === 'user' ? 'msg msg-user' : 'msg msg-ai';
    var body = m.role === 'user' ? U.esc(m.text) : richHTML(m.text || (m.streaming ? '' : ''));
    var patchCard = '';
    if (m.patch) patchCard = patchCardHTML(m, i);
    if (m.changes) patchCard = '<div class="patch-card ok-state"><span class="ok-t">✔ Applied: ' + U.esc(m.changes) + '</span> <span class="tiny muted">— see 🕘 Versions to review or revert</span></div>';
    if (m.error) patchCard = '<div class="patch-card bad-state"><span class="bad-t">⚠ ' + U.esc(m.error) + '</span></div>';
    return '<div class="' + cls + '" data-mi="' + i + '"><div class="msg-head">' + who +
      '<span class="tiny muted" style="margin-left:6px">' + U.fmtAgo(m.at) + '</span></div>' +
      '<div class="msg-body"' + (m.streaming ? ' id="streamBody"' : '') + '>' + body +
      (m.streaming ? '<span class="typing"><i></i><i></i><i></i></span>' : '') + '</div>' + patchCard + '</div>';
  }

  function patchCardHTML(m, i) {
    var v = PO.ai.validatePatch(m.patch);
    var nOps = (m.patch.ops || []).length;
    if (!v.ok) {
      return '<div class="patch-card bad-state"><strong>Proposed patch — ' + nOps + ' op(s), invalid</strong>' +
        '<ul class="small" style="margin:6px 0 0 16px">' + v.errors.slice(0, 4).map(function (e) { return '<li>' + U.esc(e) + '</li>'; }).join('') + '</ul>' +
        '<div class="row" style="margin-top:8px"><button class="btn sm" data-dismiss="' + i + '">Dismiss</button></div></div>';
    }
    var lines = m.patch.ops.map(function (o) {
      if (o.op === 'update') return '<li><span class="pill">update</span> <a href="#/node/' + U.esc(o.id) + '">' + U.esc(o.id) + '</a>' + (o.title ? ' → “' + U.esc(o.title) + '”' : '') + '</li>';
      if (o.op === 'create') return '<li><span class="pill type">create</span> <strong>' + U.esc(o.type) + '</strong> “' + U.esc(o.title) + '”</li>';
      if (o.op === 'link') return '<li><span class="pill">link</span> ' + U.esc(o.a) + ' —' + U.esc(o.rel || 'relatedTo') + '→ ' + U.esc(o.b) + '</li>';
      if (o.op === 'delete') return '<li><span class="pill conf-low">delete</span> ' + U.esc(o.id) + (o.reason ? ' <span class="tiny muted">(' + U.esc(o.reason) + ')</span>' : '') + '</li>';
      return '<li>' + U.esc(o.op) + '</li>';
    }).join('');
    return '<div class="patch-card"><strong>Proposed patch — ' + nOps + ' op(s)</strong>' +
      '<ul class="small" style="margin:6px 0 0 16px">' + lines + '</ul>' +
      '<div class="row" style="margin-top:8px"><button class="btn sm primary" data-apply="' + i + '">✔ Apply to workspace</button>' +
      '<button class="btn sm" data-dismiss="' + i + '">Dismiss</button>' +
      '<span class="tiny muted">applied changes are versioned — revert in 🕘 Versions</span></div></div>';
  }

  function richHTML(text) {
    var out = '', rest = String(text || '');
    var re = /```([\w-]*)\n?([\s\S]*?)(?:```|$)/g, m, last = 0;
    while ((m = re.exec(rest))) {
      out += PO.readme.mdToHTML(rest.slice(last, m.index));
      if (m[1] === 'po-patch') out += '<div class="tiny muted mono">po-patch payload …</div>';
      else out += '<pre><code>' + U.esc(m[2]) + '</code></pre>';
      last = re.lastIndex;
    }
    out += PO.readme.mdToHTML(rest.slice(last));
    return out;
  }

  function quickActions(W) {
    var A = PO.analyze, st = A.stats(W), acts = [];
    var gaps = A.coverage(W).gaps.length;
    var neg = A.negativeSpace(W).length;
    var unc = st.uncertain + A.reviewQueue(W).filter(function (i) { return i.reasons.some(function (r) { return r.k === 'dup'; }); }).length;
    if (gaps) acts.push(['Explain ' + gaps + ' coverage gap' + (gaps > 1 ? 's' : ''), 'Explain each requirement that has no implementing feature, and propose what feature or script would close the gap. Cite ids. No patch.']);
    if (neg) acts.push(['Spot ' + neg + ' negative-space hit' + (neg > 1 ? 's' : ''), 'Walk the negative-space findings for this workspace. For each, say whether it is a real omission and propose the missing piece. No patch.']);
    if (st.conflicts) acts.push(['Resolve ' + st.conflicts + ' conflict' + (st.conflicts > 1 ? 's' : ''), 'List every conflictsWith pair. For each, propose which wording should win and why, as an update plan. No patch.']);
    if (unc) acts.push(['Triage ' + unc + ' review item' + (unc > 1 ? 's' : ''), 'Triage the uncertain inbox and duplicate candidates: for each, recommend accept, merge, or re-parent, in one line each. No patch.']);
    if (st.stale) acts.push(['Freshen ' + st.stale + ' stale item' + (st.stale > 1 ? 's' : ''), 'Go through every stale-flagged node. For each, say what likely changed upstream and whether its text needs an update. No patch.']);
    var tests = (W.tests || []).length;
    if (!tests) acts.push(['Suggest tests', 'Suggest 5 test cases for this workspace, each with an input question and a contains/keywords expectation. No patch.']);
    acts.push(['What am I missing?', 'Review this workspace like a spec reviewer: list the biggest gaps, contradictions and unanswered questions, citing node ids. No patch.']);
    return acts.slice(0, 6);
  }

  function drawActions(host) {
    var box = host.querySelector('#chatActions');
    var acts = quickActions(W());
    box.innerHTML = acts.map(function (a, i) {
      return '<button class="chip" data-quick="' + i + '" title="' + U.esc(a[1].slice(0, 80)) + '…">' + a[0] + '</button>';
    }).join('');
    box.querySelectorAll('[data-quick]').forEach(function (b) {
      b.onclick = function () { send(acts[+b.dataset.quick][1]); };
    });
  }

  function wire(host, ui) {
    var input = host.querySelector('#chatInput');
    var sendBtn = host.querySelector('#chatSend');
    var stopBtn = host.querySelector('#chatStop');
    var setBtn = host.querySelector('#chatSettings');
    var clearBtn = host.querySelector('#chatClear');
    var statBtn = host.querySelector('#chatStats');
    var trimBtn = host.querySelector('[data-trim]');

    function doSend() { send(input.value); }
    sendBtn.onclick = doSend;
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); doSend(); }
    });
    if (stopBtn) stopBtn.onclick = function () { if (S.abort) S.abort.abort(); };
    setBtn.onclick = function () { openSettings(); };
    if (statBtn) statBtn.onclick = function () { openUsage(); };
    if (trimBtn) trimBtn.onclick = function () {
      if (S.msgs.length > 4) S.msgs.splice(0, Math.floor(S.msgs.length / 2));
      PO.ui.render();
      PO.ui.toast('Oldest messages trimmed — context freed.', 'ok');
    };
    clearBtn.onclick = function () {
      S.msgs = [];
      drawMessages(host, ui);
      ui.toast('Chat session cleared.', 'ok');
    };
  }

  function openUsage() {
    var u = PO.ai.usageSummary();
    var byModel = u.today.byModel || {};
    var rows = Object.keys(byModel).sort(function (a, b) { return byModel[b].msgs - byModel[a].msgs; }).map(function (m) {
      var d = byModel[m];
      return '<tr><td class="mono tiny">' + U.esc(m) + '</td><td>' + d.msgs + '</td><td>~' + U.fmtNum(d.inTok + d.outTok) + '</td></tr>';
    }).join('') || '<tr><td colspan=3 class="muted">No messages today yet.</td></tr>';
    PO.ui.modal('<h2>📊 AI efficiency</h2>',
      '<div class="grid c4"><div class="stat"><div class="v">' + u.todayMsgs + '</div><div class="l">messages today</div></div>' +
      '<div class="stat"><div class="v">~' + U.fmtNum(u.todayTok) + '</div><div class="l">tokens today</div></div>' +
      '<div class="stat"><div class="v">' + u.weekMsgs + '</div><div class="l">msgs this week</div></div>' +
      '<div class="stat"><div class="v">' + (u.avgMs ? (u.avgMs / 1000).toFixed(1) + 's' : '—') + '</div><div class="l">avg reply time</div></div></div>' +
      '<h3>Today by model</h3><table class="tbl"><tr><th>Model</th><th>Msgs</th><th>~Tokens</th></tr>' + rows + '</table>' +
      '<p class="tiny muted">Counted in this browser only — providers never see these totals.</p>',
      [{ label: 'Close', primary: true }]);
  }

  function wireBubbles(host, ui) {
    host.querySelectorAll('[data-apply]').forEach(function (b) {
      b.onclick = function () { applyMsg(+b.dataset.apply, ui); };
    });
    host.querySelectorAll('[data-dismiss]').forEach(function (b) {
      b.onclick = function () {
        var m = S.msgs[+b.dataset.dismiss];
        if (m) { m.patch = null; drawMessages(host, ui); }
      };
    });
  }

  function historyMessages() {
    var c = cfg();
    var limit = PO.ai.contextLimit(c);
    var budget = Math.floor(limit * 0.45);
    var budgetChars = budget * 4;
    var msgs = [{ role: 'system', content: PO.ai.systemPrompt(W(), { nodeId: PO.ui.state.nodeId }) }];
    var hist = [];
    S.msgs.forEach(function (m) {
      if (m.streaming) return;
      var content = m.role === 'assistant' ? (m.plain || stripPatch(m.text || '')) : m.text;
      if (!content || !content.trim()) return;
      if (m.changes) content += '\n[The user applied this patch: ' + m.changes + '.]';
      hist.push({ role: m.role, content: content });
    });
    var used = 0, start = hist.length;
    for (var i = hist.length - 1; i >= 0; i--) {
      used += hist[i].content.length;
      if (used > budgetChars) break;
      start = i;
    }
    if (start > 0) hist = hist.slice(start);
    hist.forEach(function (m) { msgs.push({ role: m.role, content: m.content.slice(0, 4000) }); });
    return msgs;
  }
  function stripPatch(t) { return String(t || '').replace(/```po-patch[\s\S]*?```/g, '[patch]').trim(); }

  function send(text) {
    text = String(text || '').trim();
    if (!text || S.busy) return;
    if (window.PO_SNAPSHOT_MODE) { PO.ui.toast('Chat needs the networked app — offline snapshots have no AI.', 'warn'); return; }
    var c = cfg();
    if (!c.apiKey) {
      openSettings();
      PO.ui.toast('Add your API key first — it never leaves your browser except to your chosen provider.', 'warn');
      return;
    }
    S.msgs.push({ role: 'user', text: text, at: U.nowISO() });
    var ai = { role: 'assistant', text: '', at: U.nowISO(), streaming: true };
    S.msgs.push(ai);
    S.busy = true;
    var host = document.querySelector('#tabContent');
    if (host) { drawMessages(host, PO.ui); var sb = document.getElementById('chatSend'); if (sb) sb.disabled = true; }
    S.abort = new AbortController();
    var full = '';
    var t0 = Date.now();
    PO.ai.streamChat(c, historyMessages(), {
      onDelta: function (t) {
        full += t;
        ai.text = full;
        var body = document.getElementById('streamBody');
        if (body) {
          body.innerHTML = richHTML(full) + '<span class="typing"><i></i><i></i><i></i></span>';
          var box = document.getElementById('chatScroll');
          if (box) box.scrollTop = box.scrollHeight;
        }
      },
      onDone: function () {
        S.busy = false; S.abort = null;
        ai.streaming = false;
        ai.plain = stripPatch(full);
        ai.text = full;
        PO.ai.recordUsage({ provider: c.provider, model: c.model, inTok: Math.ceil((text.length + 3500) / 4), outTok: Math.ceil(full.length / 4), ms: Date.now() - t0 });
        var p = PO.ai.extractPatch(full);
        if (p) {
          if (p._parseError) { ai.error = 'Patch block could not be parsed as JSON: ' + p._parseError; }
          else ai.patch = p;
        }
        redraw();
      }
    }, S.abort.signal).catch(function (err) {
      S.busy = false; S.abort = null;
      ai.streaming = false;
      if (String(err && err.name) === 'AbortError') {
        ai.text = (full || '') + '\n\n_(stopped)_';
      } else {
        ai.error = (err && err.message) || String(err);
      }
      redraw();
    });

    function redraw() {
      var h = document.querySelector('#tabContent');
      if (h && PO.ui.state.tab === 'chat') { drawMessages(h, PO.ui); drawActions(h); }
      else PO.ui.render();
    }
  }

  function applyMsg(i, ui) {
    var m = S.msgs[i];
    if (!m || !m.patch || S.busy) return;
    var v = PO.ai.validatePatch(m.patch);
    if (!v.ok) { ui.toast('Patch invalid: ' + v.errors[0], 'bad'); return; }
    var r = PO.ai.applyPatch(m.patch, 'chat');
    m.patch = null;
    m.changes = PO.ai.summarizeChanges(r);
    PO.store.persist();
    ui.render();
    ui.toast('Applied: ' + m.changes + (r.skipped.length ? ' · ' + r.skipped.length + ' op(s) skipped' : ''), 'ok');
  }

  function openSettings() {
    var c = cfg();
    var P = PO.ai.presets();
    var provOpts = Object.keys(P).map(function (k) {
      return '<option value="' + k + '"' + (c.provider === k ? ' selected' : '') + '>' + U.esc(P[k].label) + '</option>';
    }).join('');
    var models = (P[c.provider] || {}).models || [];
    PO.ui.modal('<h2>⚙ AI Configuration Settings</h2>',
      '<p class="small muted">Your API key is stored only in this browser (localStorage) and sent only to the provider you choose. ' +
      'Any OpenAI-compatible endpoint works — including fully local models.</p>' +
      '<div class="row"><div style="flex:1;min-width:160px"><label class="small muted">Provider</label>' +
      '<select id="aiProv">' + provOpts + '</select></div>' +
      '<div style="flex:2;min-width:220px"><label class="small muted">Model</label>' +
      '<input type="text" id="aiModel" list="aiModelList" value="' + U.esc(c.model) + '" placeholder="gpt-4o-mini">' +
      '<datalist id="aiModelList">' + models.map(function (m) { return '<option value="' + U.esc(m) + '">'; }).join('') + '</datalist></div></div>' +
      '<div class="row"><div style="flex:2;min-width:220px"><label class="small muted">API Base URL</label>' +
      '<input type="text" id="aiBase" value="' + U.esc(c.baseUrl) + '"></div>' +
      '<div style="flex:1;min-width:160px"><label class="small muted">API Key</label>' +
      '<input type="password" id="aiKey" value="' + U.esc(c.apiKey) + '" placeholder="' + U.esc((P[c.provider] || {}).keyHint || 'key') + '" autocomplete="off"></div></div>' +
      '<label class="small muted">Extra system instructions (optional — tone, house rules)</label>' +
      '<textarea id="aiSys" style="min-height:60px" placeholder="e.g. Always answer tersely. Never invent requirements.">' + U.esc(c.systemExtra) + '</textarea>' +
      '<div class="row" style="margin-top:8px">' +
      '<button class="btn sm" id="aiTest">Test connection</button><span id="aiTestOut" class="small"></span></div>' +
      '<div id="aiDetails" style="margin-top:12px"></div>' +
      '<p class="tiny muted" id="aiProvNote"></p>',
      [{ label: 'Cancel' }, {
        label: 'Save settings', primary: true, onClick: function () {
          var prov = U.$('aiProv').value;
          var next = {
            provider: prov,
            baseUrl: U.$('aiBase').value.trim() || P[prov].baseUrl,
            model: U.$('aiModel').value.trim() || (P[prov].models[0] || ''),
            apiKey: U.$('aiKey').value.trim(),
            systemExtra: U.$('aiSys').value
          };
          PO.ai.save(next);
          PO.ui.closeModal();
          PO.ui.render();
          PO.ui.toast('AI settings saved (browser-local).', 'ok');
        }
      }]);
    function note() {
      var p = P[U.$('aiProv').value] || {};
      U.$('aiProvNote').innerHTML = (p.note || '') + (p.docs ? ' · <a href="' + p.docs + '" target="_blank" rel="noopener">get a key ↗</a>' : '');
      var det = U.$('aiDetails');
      var curModel = U.$('aiModel').value.trim();
      var info = PO.ai.modelInfo(curModel);
      det.innerHTML = '<div class="card" style="margin:0"><h3 style="margin:0 0 6px">Model Details</h3>' +
        '<div class="small"><strong>Model:</strong> ' + U.esc(curModel || '—') + '<br>' +
        '<strong>Context Window:</strong> ' + (info && info.ctx ? info.ctx.toLocaleString() + ' tokens' : '—') + '<br>' +
        '<strong>Provider:</strong> ' + U.esc(p.label || '') + '</div>' +
        '<p class="tiny muted" style="margin:6px 0 0">Context window determines how much text the model can see at once. Larger windows handle bigger workspaces but may be slower.</p></div>';
    }
    function syncProv() {
      var k = U.$('aiProv').value;
      U.$('aiBase').value = P[k].baseUrl;
      U.$('aiModel').value = P[k].models[0] || '';
      U.$('aiModelList').innerHTML = (P[k].models || []).map(function (m) { return '<option value="' + U.esc(m) + '">'; }).join('');
      U.$('aiKey').placeholder = P[k].keyHint || 'key';
      note();
    }
    U.$('aiProv').onchange = syncProv;
    U.$('aiModel').addEventListener('input', note);
    note();
    U.$('aiTest').onclick = function () {
      var out = U.$('aiTestOut');
      out.textContent = 'Testing…'; out.className = 'small muted';
      var testCfg = {
        provider: U.$('aiProv').value, baseUrl: U.$('aiBase').value.trim(),
        model: U.$('aiModel').value.trim(), apiKey: U.$('aiKey').value.trim()
      };
      PO.ai.completeOnce(testCfg, [
        { role: 'user', content: 'Reply with exactly: OK' }
      ]).then(function (r) {
        out.textContent = '✔ Works — model replied: ' + String(r || '').trim().slice(0, 40);
        out.className = 'small ok-t';
      }).catch(function (e) {
        out.textContent = '✖ ' + (e.message || e);
        out.className = 'small bad-t';
      });
    };
  }

  function wireLauncher() {
    var btn = document.getElementById('btnChat');
    if (!btn) return;
    btn.onclick = function () { PO.ui.setTab('chat'); };
  }

  PO.chat = { S: S, send: send, openSettings: openSettings, richHTML: richHTML, stripPatch: stripPatch, historyMessages: historyMessages, wireLauncher: wireLauncher };
})();
