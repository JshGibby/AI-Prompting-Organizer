/* ============================================================
   Prompt Organizer — ai.js
   AI chat ("Ask & Apply") for the workspace.

   - Bring-your-own-key: every user configures their own provider
     (OpenAI by default; any OpenAI-compatible endpoint works —
     OpenRouter, Groq, Together, LM Studio, Ollama).
   - Streaming chat completions via fetch + ReadableStream.
   - Workspace context is built locally (retrieval over nodes),
     so the model answers about THIS workspace.
   - The model can return a ```po-patch block; we validate it and
     apply it with full audit trail (changelog + version ledger),
     exactly like a human edit.
   No dependencies. No keys shipped in the repo.
   Configuration settings are fully preserved; no free-model table.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  /* ================= provider settings ================= */
  var LS_KEY = 'po.ai.settings.v1';

  var PRESETS = {
    openai: {
      label: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4.1', 'o4-mini'],
      keyHint: 'sk-…', docs: 'https://platform.openai.com/api-keys',
      note: 'Create an API key at platform.openai.com — it stays in your browser.'
    },
    openrouter: {
      label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
      models: ['openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001', 'mistralai/mistral-small-3.1-24b-instruct'],
      keyHint: 'sk-or-…', docs: 'https://openrouter.ai/keys',
      note: 'One key, many models. Use any model id supported by OpenRouter.'
    },
    groq: {
      label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
      models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama-3.2-90b-text-preview', 'mixtral-8x7b-32768'],
      keyHint: 'gsk_…', docs: 'https://console.groq.com/keys',
      note: 'Ultra-fast inference. Configure your own rate limits in Groq console.'
    },
    cerebras: {
      label: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1',
      models: ['llama-3.3-70b', 'llama3.1-8b'],
      keyHint: 'csk-…', docs: 'https://cloud.cerebras.ai',
      note: 'High-speed inference endpoint.'
    },
    gemini: {
      label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-pro'],
      keyHint: 'AI…', docs: 'https://aistudio.google.com/apikey',
      note: 'Google AI Studio key — OpenAI-compatible endpoint.'
    },
    mistral: {
      label: 'Mistral (La Plateforme)', baseUrl: 'https://api.mistral.ai/v1',
      models: ['mistral-small-latest', 'open-mistral-nemo', 'mistral-large-latest', 'codestral-latest'],
      keyHint: '…', docs: 'https://console.mistral.ai/api-keys',
      note: 'Mistral API — configure limits in console.'
    },
    together: {
      label: 'Together AI', baseUrl: 'https://api.together.xyz/v1',
      models: ['meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
      keyHint: '…', docs: 'https://api.together.ai/settings/api-keys',
      note: 'Together AI — serverless inference.'
    },
    lmstudio: {
      label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1',
      models: ['local-model'],
      keyHint: 'lm-studio', docs: 'https://lmstudio.ai',
      note: 'Runs on your machine. In LM Studio: Developer tab → Start server (enable CORS).'
    },
    ollama: {
      label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1',
      models: ['llama3.2', 'qwen2.5', 'mistral', 'gemma2', 'deepseek-r1'],
      keyHint: 'ollama', docs: 'https://ollama.com',
      note: 'Runs on your machine, unlimited and private. Start with OLLAMA_ORIGINS=* ollama serve.'
    }
  };

  /* Model context windows — no quota table, just technical limits */
  var MODEL_CTX = {
    'gpt-4o-mini': 128000,
    'gpt-4.1-mini': 128000,
    'gpt-4o': 128000,
    'gpt-4.1': 128000,
    'o4-mini': 128000,
    'llama-3.3-70b-versatile': 128000,
    'llama-3.1-8b-instant': 128000,
    'llama-3.2-90b-text-preview': 128000,
    'mixtral-8x7b-32768': 32768,
    'llama-3.3-70b': 128000,
    'llama3.1-8b': 128000,
    'openai/gpt-4o-mini': 128000,
    'meta-llama/llama-3.3-70b-instruct': 128000,
    'anthropic/claude-3.5-sonnet': 200000,
    'google/gemini-2.0-flash-001': 1000000,
    'mistralai/mistral-small-3.1-24b-instruct': 128000,
    'gemini-2.0-flash': 1000000,
    'gemini-2.0-flash-lite': 1000000,
    'gemini-1.5-flash': 1000000,
    'gemini-1.5-pro': 1000000,
    'mistral-small-latest': 128000,
    'open-mistral-nemo': 128000,
    'mistral-large-latest': 128000,
    'codestral-latest': 32000,
    'meta-llama/Llama-3.3-70B-Instruct-Turbo': 128000,
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': 128000,
    'llama3.2': 128000,
    'qwen2.5': 128000,
    'mistral': 32000,
    'gemma2': 8192,
    'deepseek-r1': 128000,
    'local-model': 32000
  };

  function modelInfo(model) {
    var ctx = MODEL_CTX[model] || null;
    if (!ctx) {
      var m = String(model||'').toLowerCase();
      if (m.indexOf('gemini')>=0) ctx = 1000000;
      else if (m.indexOf('claude')>=0) ctx = 200000;
      else ctx = 128000;
    }
    return { ctx: ctx };
  }
  function localProvider(p) { return p === 'ollama' || p === 'lmstudio'; }

  /* ---------- usage tracker (AI efficiency, per browser) ---------- */
  var USE_KEY = 'po.ai.usage.v1';
  function loadUsage() {
    try { return JSON.parse(localStorage.getItem(USE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function recordUsage(entry) {
    var u = loadUsage();
    var d = new Date().toISOString().slice(0, 10);
    u[d] = u[d] || { msgs: 0, inTok: 0, outTok: 0, ms: 0, byModel: {} };
    var day = u[d];
    day.msgs++; day.inTok += entry.inTok || 0; day.outTok += entry.outTok || 0; day.ms += entry.ms || 0;
    var m = day.byModel[entry.model] = day.byModel[entry.model] || { msgs: 0, inTok: 0, outTok: 0 };
    m.msgs++; m.inTok += entry.inTok || 0; m.outTok += entry.outTok || 0;
    var cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    Object.keys(u).forEach(function (k) { if (k < cutoff) delete u[k]; });
    try { localStorage.setItem(USE_KEY, JSON.stringify(u)); } catch (e) { /* ok */ }
  }
  function usageSummary() {
    var u = loadUsage(), days = Object.keys(u).sort(), today = new Date().toISOString().slice(0, 10);
    var sum = { todayMsgs: 0, todayTok: 0, weekMsgs: 0, weekTok: 0, ms: 0, days: days.length };
    var weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    days.forEach(function (d) {
      var day = u[d];
      if (d === today) { sum.todayMsgs += day.msgs; sum.todayTok += day.inTok + day.outTok; }
      if (d >= weekAgo) { sum.weekMsgs += day.msgs; sum.weekTok += day.inTok + day.outTok; }
      sum.ms += day.ms;
    });
    sum.avgMs = sum.weekMsgs ? Math.round(sum.ms / Math.max(1, sum.weekMsgs)) : 0;
    sum.today = u[today] || { msgs: 0, inTok: 0, outTok: 0, byModel: {} };
    sum.raw = u;
    return sum;
  }

  var DEFAULTS = { provider: 'openai', baseUrl: PRESETS.openai.baseUrl, model: 'gpt-4o-mini', apiKey: '', systemExtra: '' };

  function contextLimit(cfgLike) {
    if (!cfgLike) return 128000;
    var info = MODEL_CTX[cfgLike.model];
    if (info) return info;
    var m = String(cfgLike.model || '').toLowerCase();
    if (m.indexOf('gemini') >= 0) return 1000000;
    if (m.indexOf('claude') >= 0) return 200000;
    return 128000;
  }

  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { /* ignore */ }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = s[k] != null ? s[k] : DEFAULTS[k]; });
    if (!PRESETS[out.provider]) out.provider = 'openai';
    return out;
  }
  function save(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  function presets() { return PRESETS; }
  function freeModels() { return MODEL_CTX; } /* kept for compat, now returns ctx map */
  function isLocal(p) { return localProvider(p); }

  /* ================= streaming chat client ================= */
  function streamChat(cfg, messages, handlers, signal) {
    var url = (cfg.baseUrl || PRESETS.openai.baseUrl).replace(/\/+$/, '') + '/chat/completions';
    return fetch(url, {
      method: 'POST',
      signal: signal || undefined,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (cfg.apiKey || '')
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: messages,
        stream: true,
        temperature: 0.3
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var msg = 'HTTP ' + res.status + ' from ' + url;
          try { var j = JSON.parse(t); if (j.error && j.error.message) msg = j.error.message; } catch (e) { if (t) msg += ' — ' + t.slice(0, 200); }
          throw new Error(msg);
        });
      }
      if (!res.body) throw new Error('Streaming not supported in this browser.');
      return readSSE(res.body, handlers);
    });
  }

  function readSSE(body, handlers) {
    var reader = body.getReader();
    var dec = new TextDecoder('utf-8');
    var buf = '', full = '';
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          flushLine(buf);
          handlers.onDone(full);
          return full;
        }
        buf += dec.decode(r.value, { stream: true });
        var idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          var line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);
          if (/^:\s/.test(line)) continue;
          if (line.indexOf('data:') === 0) flushLine(line.slice(5).trim(), function (txt) { full += txt; handlers.onDelta(txt); });
        }
        return pump();
      });
    }
    function flushLine(data) {
      if (!data || data === '[DONE]') return;
      try {
        var j = JSON.parse(data);
        var d = j.choices && j.choices[0] && j.choices[0].delta;
        if (d && d.content) handlers.onDelta(d.content);
      } catch (e) { /* partial JSON — ignore, next chunk completes it */ }
    }
    return pump();
  }

  function completeOnce(cfg, messages) {
    return new Promise(function (resolve, reject) {
      var full = '';
      streamChat(cfg, messages, {
        onDelta: function (t) { full += t; },
        onDone: function () { resolve(full); },
        onError: reject
      }).catch(reject);
    });
  }

  /* ================= workspace context builder ================= */
  function buildContext(W, question, opts) {
    opts = opts || {};
    var A = PO.analyze;
    var lines = [];
    var sel = opts.nodeId && W.nodes[opts.nodeId] ? W.nodes[opts.nodeId] : null;

    lines.push('WORKSPACE: ' + (W.name || 'Untitled') + ' — ' + Object.keys(W.nodes).length + ' nodes, ' + W.edges.length + ' links.');
    var st = A.stats(W);
    lines.push('TYPES: ' + Object.keys(st.byType).map(function (t) { return t + '×' + st.byType[t]; }).join(', '));
    var health = A.health(W);
    lines.push('HEALTH: ' + health.score + '/100. Orphans ' + st.orphans + ' · uncertain ' + st.uncertain + ' · stale ' + st.stale + ' · conflicts ' + st.conflicts + ' · requirements ' + st.reqs + ' (open coverage gaps: ' + A.coverage(W).gaps.length + ').');

    if (sel) {
      lines.push('');
      lines.push('SELECTED NODE ' + sel.id + ' — ' + (sel.title || '') + ' [' + sel.type + '/' + sel.status + ']');
      lines.push('TEXT: ' + String(sel.text || '').slice(0, 600));
      if (sel.parent && W.nodes[sel.parent]) lines.push('PARENT: ' + sel.parent + ' — ' + W.nodes[sel.parent].title);
    }

    var q = String(question || '') + ' ' + (sel ? (sel.title + ' ' + sel.text.slice(0, 200)) : '');
    var scored = A.searchNodes(W, q, {}).slice(0, 12);
    if (sel) {
      A.neighbors(W, sel.id).slice(0, 4).forEach(function (n) {
        if (!scored.some(function (s) { return s.node.id === n.id; })) scored.push({ node: n, score: 0 });
      });
    }
    if (scored.length) {
      lines.push('');
      lines.push('RELEVANT NODES (verbatim text — do not paraphrase when quoting):');
      scored.slice(0, 8).forEach(function (s) {
        var n = s.node;
        lines.push('- ' + n.id + ' — ' + (n.title || '') + ' [' + n.type + '/' + n.status + ']');
        lines.push('  ' + String(n.text || '').slice(0, 320));
      });
    }

    var qs = (W.questions || []).filter(function (x) { return !x.resolved; }).slice(0, 4);
    if (qs.length) {
      lines.push('');
      lines.push('OPEN QUESTIONS IN WORKSPACE:');
      qs.forEach(function (x) { lines.push('- ' + x.q + (x.nodeId ? ' (on ' + x.nodeId + ')' : '')); });
    }
    // Include root readme as overall summary if available
    try {
      var rootReadme = (W.readmes && W.readmes['folder.root'] && W.readmes['folder.root'].md) || '';
      if (rootReadme) {
        lines.push('');
        lines.push('PROJECT OVERALL SUMMARY (from README):');
        lines.push(rootReadme.slice(0, 2000));
      }
    } catch(e){}
    return lines.join('\n');
  }

  function systemPrompt(W, opts) {
    var A = PO.analyze;
    var reqs = (W.requirements || []).filter(function (r) { return r.kind === 'hard'; }).slice(0, 10)
      .map(function (r) { return '- ' + r.text.slice(0, 140); }).join('\n');
    return [
      'You are the built-in AI assistant for Prompt Organizer, a tool that turns messy prompts into a structured workspace of nodes (stable ids like feature.farming-loop), folders, edges (partof / dependsOn / implements / requires / references / conflictsWith) and requirements.',
      '',
      'CURRENT WORKSPACE CONTEXT:',
      buildContext(W, '', opts || {}),
      reqs ? ('\nHARD REQUIREMENTS:\n' + reqs) : '',
      '',
      'HOW TO ANSWER:',
      '- Ground answers in the context. Cite node ids when referencing items, like rule.items-never-lost.',
      '- If something is not in the workspace, say so plainly.',
      '- You may also suggest: which nodes are duplicates, which requirements lack implements-links, what to ask the author next.',
      '',
      'HOW TO EDIT (only when the user asks you to change something):',
      '1. Reply with a SHORT plan as a markdown list (what you will change and why).',
      '2. End the reply with ONE fenced block tagged po-patch containing a JSON object:',
      '   { "ops": [ { "op": "update", "id": "rule.x", "text": "full new verbatim text", "title": "optional new title", "tags": ["optional","tags"] },',
      '               { "op": "create", "type": "rule|feature|mechanic|idea|topic|requirement|document|script|asset|test|prompt", "title": "Short title", "text": "verbatim text", "parent": "optional folder id", "tags": ["optional"] },',
      '               { "op": "link", "a": "node.a", "b": "node.b", "rel": "implements", "note": "optional" },',
      '               { "op": "delete", "id": "node.x", "reason": "why" } ] }',
      '3. Rules: update/create text must stay verbatim from the user intent; prefer update over delete; never delete folders; use exists ids for link endpoints.',
      '',
      'If the user only asked a question, do NOT include a po-patch block.'
    ].filter(Boolean).join('\n');
  }

  /* ================= patch validation & applier ================= */
  var VALID_TYPES = PO.store.NODE_TYPES;
  var VALID_RELS = PO.store.RELS;

  function validatePatch(p) {
    var errs = [];
    if (!p || typeof p !== 'object') return { ok: false, errors: ['Patch is not an object.'] };
    if (!Array.isArray(p.ops) || !p.ops.length) return { ok: false, errors: ['Patch has no ops array.'] };
    if (p.ops.length > 25) return { ok: false, errors: ['Too many ops (' + p.ops.length + ', max 25).'] };
    p.ops.forEach(function (o, i) {
      var pre = 'op[' + i + '] ';
      if (!o || typeof o !== 'object') { errs.push(pre + 'is not an object.'); return; }
      if (o.op === 'update') {
        if (!W$1().nodes[o.id]) errs.push(pre + 'update: unknown id ' + o.id);
        if (o.text != null && typeof o.text !== 'string') errs.push(pre + 'update: text must be a string');
        if (o.text != null && !String(o.text).trim()) errs.push(pre + 'update: empty text not allowed (delete instead)');
        if (o.type && VALID_TYPES.indexOf(o.type) < 0) errs.push(pre + 'update: bad type ' + o.type);
      } else if (o.op === 'create') {
        if (!o.title || !String(o.title).trim()) errs.push(pre + 'create: title required');
        if (!o.text || !String(o.text).trim()) errs.push(pre + 'create: text required');
        if (!o.type || VALID_TYPES.indexOf(o.type) < 0) errs.push(pre + 'create: bad type "' + o.type + '"');
      } else if (o.op === 'link') {
        if (!o.a || !o.b) errs.push(pre + 'link: a and b required');
        else if (o.a === o.b) errs.push(pre + 'link: a and b must differ');
        if (o.rel && VALID_RELS.indexOf(o.rel) < 0) errs.push(pre + 'link: bad rel "' + o.rel + '" (use ' + VALID_RELS.join('|') + ')');
      } else if (o.op === 'delete') {
        if (!o.id || !W$1().nodes[o.id]) errs.push(pre + 'delete: unknown id ' + o.id);
        else if (/^folder\./.test(o.id)) errs.push(pre + 'delete: folders cannot be deleted');
      } else errs.push(pre + 'unknown op "' + o.op + '" (update|create|link|delete)');
    });
    return { ok: errs.length === 0, errors: errs };
  }
  var _testW = null;
  function W$1() { return _testW || PO.store.W(); }
  function setWorkspaceForValidation(w) { _testW = w; }

  function extractPatch(text) {
    var m = String(text || '').match(/```po-patch\s*([\s\S]*?)```/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch (e) { return { _parseError: String(e.message || e), _raw: m[1] }; }
  }

  function applyPatch(p, actor) {
    var W = W$1();
    var t = U.nowISO();
    var applied = [], skipped = [];
    (p.ops || []).forEach(function (o) {
      if (o.op === 'update') {
        var n = W.nodes[o.id];
        if (!n) { skipped.push({ op: o, why: 'unknown id' }); return; }
        var before = n.text;
        if (typeof o.text === 'string') { n.text = o.text; n.quote = o.text.slice(0, 220); }
        if (o.title) n.title = String(o.title).slice(0, 120);
        if (o.type && VALID_TYPES.indexOf(o.type) >= 0) n.type = o.type;
        if (Array.isArray(o.tags)) n.tags = o.tags.map(String).slice(0, 10);
        n.updated = t; n.ver = (n.ver || 1) + 1;
        n.why = 'Updated by AI chat (' + (actor || 'you') + ') from user request.';
        if (n.stale) n.stale = { flag: false, reason: '' };
        PO.store.addVersion('ai-edit', 'AI chat updated ' + o.id, { nodeId: o.id, before: before, after: n.text });
        PO.store.log('ai-edit', 'AI updated “' + n.title + '” (' + o.id + ').', o.id, actor);
        PO.analyze.markStale(W, o.id, '“' + n.title + '” was updated by the AI assistant.');
        PO.readme.touchParents(W, o.id);
        applied.push({ op: 'update', id: o.id });
      } else if (o.op === 'create') {
        var id = PO.ingest.makeId(W, o.type, o.title);
        var parent = o.parent && W.nodes[o.parent] ? o.parent : (PO.store.TYPE_FOLDER[o.type] || 'folder.inbox');
        var t0 = U.nowISO();
        W.nodes[id] = {
          id: id, title: String(o.title).slice(0, 120), type: o.type, status: 'asserted',
          text: String(o.text), quote: String(o.text).slice(0, 220), anchor: null, parent: parent,
          tags: (Array.isArray(o.tags) ? o.tags.map(String) : ['ai']).slice(0, 10),
          entities: PO.ingest.extractEntities(o.text), conf: 0.9,
          created: t0, updated: t0, ver: 1,
          why: 'Created by AI chat (' + (actor || 'you') + ') from user request.',
          stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
        };
        W.edges.push({ id: U.uid('e'), a: id, b: parent, rel: 'partof', note: 'AI-created.', auto: true, created: t0 });
        PO.store.addVersion('ai-add', 'AI chat created ' + id, { nodeId: id, after: o.text });
        PO.store.log('ai-add', 'AI created “' + o.title + '” (' + id + ').', id, actor);
        PO.readme.touchParents(W, id);
        applied.push({ op: 'create', id: id });
      } else if (o.op === 'link') {
        var rel = VALID_RELS.indexOf(o.rel) >= 0 ? o.rel : 'relatedTo';
        if (!W.nodes[o.a] || !W.nodes[o.b]) { skipped.push({ op: o, why: 'unknown endpoint' }); return; }
        var dup = W.edges.some(function (e) { return e.a === o.a && e.b === o.b && e.rel === rel; });
        if (dup) { skipped.push({ op: o, why: 'link already exists' }); return; }
        W.edges.push({ id: U.uid('e'), a: o.a, b: o.b, rel: rel, note: o.note || 'AI chat link.', auto: true, created: U.nowISO() });
        PO.store.log('ai-link', 'AI linked ' + o.a + ' —' + rel + '→ ' + o.b, o.a, actor);
        applied.push({ op: 'link', id: o.a + '→' + o.b });
      } else if (o.op === 'delete') {
        var dn = W.nodes[o.id];
        if (!dn || /^folder\./.test(o.id)) { skipped.push({ op: o, why: 'protected or unknown' }); return; }
        var beforeTxt = dn.text;
        delete W.nodes[o.id];
        W.edges = W.edges.filter(function (e) { return e.a !== o.id && e.b !== o.id; });
        W.requirements = (W.requirements || []).filter(function (r) { return r.id !== o.id && r.sourceNodeId !== o.id; });
        W.questions = (W.questions || []).filter(function (q) { return q.nodeId !== o.id; });
        PO.store.addVersion('ai-del', 'AI chat deleted ' + o.id, { nodeId: o.id, before: beforeTxt });
        PO.store.log('ai-del', 'AI deleted “' + (dn.title || o.id) + '” (' + o.id + ').', o.id, actor);
        applied.push({ op: 'delete', id: o.id });
      }
    });
    if (applied.length) {
      PO.readme.regenerateAll(W);
      PO.store.touch();
    }
    return { applied: applied, skipped: skipped };
  }

  function summarizeChanges(r) {
    if (!r.applied.length) return 'Nothing was changed.';
    var parts = {};
    r.applied.forEach(function (a) { parts[a.op] = (parts[a.op] || 0) + 1; });
    return Object.keys(parts).map(function (k) { return parts[k] + ' ' + k; }).join(' · ');
  }

  PO.ai = {
    load: load, save: save, presets: presets,
    freeModels: freeModels, isLocal: isLocal, modelInfo: modelInfo,
    contextLimit: contextLimit,
    recordUsage: recordUsage, usageSummary: usageSummary,
    streamChat: streamChat, completeOnce: completeOnce,
    buildContext: buildContext, systemPrompt: systemPrompt,
    validatePatch: validatePatch, extractPatch: extractPatch, applyPatch: applyPatch,
    summarizeChanges: summarizeChanges, setWorkspaceForValidation: setWorkspaceForValidation,
    MODEL_CTX: MODEL_CTX
  };
})();
