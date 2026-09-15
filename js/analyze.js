/* ============================================================
   Prompt Organizer — analyze.js
   Stats, health score, coverage, negative-space, prompt lint,
   staleness/impact propagation, search, backlinks, NL Q&A.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  function nodesArr(W, skipFolders) {
    return Object.keys(W.nodes).map(function (k) { return W.nodes[k]; })
      .filter(function (n) { return !(skipFolders && n.type === 'folder'); });
  }
  function childrenOf(W, id) {
    return nodesArr(W).filter(function (n) { return n.parent === id; });
  }
  function depthOf(W, id) {
    var d = 0, n = W.nodes[id], guard = 0;
    while (n && n.parent && guard++ < 60) { d++; n = W.nodes[n.parent]; }
    return d;
  }
  function maxDepth(W) {
    var m = 0;
    nodesArr(W).forEach(function (n) { m = Math.max(m, depthOf(W, n.id)); });
    return m;
  }
  function breadcrumbs(W, id) {
    var trail = [], n = W.nodes[id], guard = 0;
    while (n && guard++ < 30) { trail.unshift(n); n = n.parent ? W.nodes[n.parent] : null; }
    return trail;
  }
  function backlinks(W, id) { return W.edges.filter(function (e) { return e.b === id; }); }
  function forwardLinks(W, id) { return W.edges.filter(function (e) { return e.a === id; }); }
  function neighbors(W, id) {
    var set = {};
    W.edges.forEach(function (e) {
      if (e.a === id) set[e.b] = 1;
      if (e.b === id) set[e.a] = 1;
    });
    return Object.keys(set).map(function (k) { return W.nodes[k]; }).filter(Boolean);
  }
  function isOrphan(W, n) {
    if (n.type === 'folder') return false;
    if (n.parent && n.parent !== 'folder.inbox') return false;
    if (n.parent === 'folder.inbox') return true;
    return backlinks(W, n.id).length + forwardLinks(W, n.id).length <= 1; // only partof edge
  }
  function orphans(W) { return nodesArr(W, true).filter(function (n) { return isOrphan(W, n); }); }

  /* ---------- stats ---------- */
  function stats(W) {
    var all = nodesArr(W, true);
    var byType = {}, byStatus = { asserted: 0, inferred: 0, merged: 0, uncertain: 0 };
    var words = 0, chars = 0, confSum = 0, stale = 0;
    all.forEach(function (n) {
      byType[n.type] = (byType[n.type] || 0) + 1;
      byStatus[n.status] = (byStatus[n.status] || 0) + 1;
      words += U.wordsOf(n.text); chars += U.charsOf(n.text);
      confSum += (n.conf == null ? 0.5 : n.conf);
      if (n.stale && n.stale.flag) stale++;
    });
    W.prompts.forEach(function (p) { words += 0; }); // node text already counted; prompts tracked separately
    var promptChars = W.prompts.reduce(function (a, p) { return a + U.charsOf(p.text); }, 0);
    var promptWords = W.prompts.reduce(function (a, p) { return a + U.wordsOf(p.text); }, 0);
    var conflicts = W.edges.filter(function (e) { return e.rel === 'conflictsWith'; }).length;
    var orph = orphans(W).length;
    var unc = byStatus.uncertain || 0;
    var tokens = U.tokenEstimate(W.prompts.map(function (p) { return p.text; }).join('\n\n')) +
      U.tokenEstimate(all.map(function (n) { return n.text; }).join('\n'));
    var jsonSize = 0;
    try { jsonSize = JSON.stringify(W).length; } catch (e) { jsonSize = -1; }
    return {
      nodes: all.length, folders: Object.keys(W.nodes).length - all.length,
      byType: byType, byStatus: byStatus,
      words: promptWords, chars: promptChars, tokens: tokens,
      readingMin: U.readingTimeMin(W.prompts.map(function (p) { return p.text; }).join('\n')),
      edges: W.edges.length, maxDepth: maxDepth(W),
      orphans: orph, uncertain: unc, merged: W.merges.length,
      conflicts: conflicts, stale: stale,
      avgConf: all.length ? confSum / all.length : 0,
      versions: W.versions.length, prompts: W.prompts.length,
      tests: W.tests.length, runs: W.runs.length, reqs: W.requirements.length,
      exportBytes: jsonSize
    };
  }

  /* ---------- health score ---------- */
  function health(W) {
    var st = stats(W);
    var n = Math.max(1, st.nodes);
    var orphanRate = st.orphans / n;
    var dupRatio = W.merges.length / n;
    var depth = st.maxDepth;
    var cov = coverage(W).pct / 100;
    var staleRate = st.stale / n;
    var uncRate = st.uncertain / n;
    function score(v, invert) { return invert ? (1 - U.clamp(v, 0, 1)) : U.clamp(v, 0, 1); }
    var depthScore = depth <= 6 ? 1 : (depth <= 9 ? 0.7 : 0.4);
    var factors = [
      { key: 'orphans', label: 'Orphaned items', value: st.orphans + ' (' + Math.round(orphanRate * 100) + '%)', score: score(orphanRate, true), w: 0.22, filter: 'orphan' },
      { key: 'duplicates', label: 'Duplicates merged', value: String(W.merges.length), score: score(dupRatio * 2, true), w: 0.1, filter: 'merged' },
      { key: 'depth', label: 'Branch depth', value: 'max ' + depth, score: depthScore, w: 0.1, filter: '' },
      { key: 'coverage', label: 'Requirement coverage', value: Math.round(cov * 100) + '%', score: score(cov), w: 0.22, filter: 'reqs' },
      { key: 'stale', label: 'Stale items', value: String(st.stale), score: score(staleRate, true), w: 0.16, filter: 'stale' },
      { key: 'uncertain', label: 'Uncertain items', value: String(st.uncertain), score: score(uncRate, true), w: 0.2, filter: 'uncertain' }
    ];
    var total = 0;
    factors.forEach(function (f) { total += f.score * f.w; });
    return { score: Math.round(total * 100), factors: factors, stats: st };
  }

  /* ---------- requirement coverage ---------- */
  function coverage(W) {
    var reqs = W.requirements;
    if (!reqs.length) return { pct: 100, gaps: [], total: 0, covered: 0 };
    var gaps = [];
    var covered = 0;
    reqs.forEach(function (r) {
      var impl = W.edges.filter(function (e) { return e.rel === 'implements' && (e.a === r.id || e.b === r.id); });
      var refs = W.edges.filter(function (e) {
        return (e.a === r.id || e.b === r.id) && e.rel !== 'references';
      });
      var ok = impl.length > 0 || (r.implementsIds || []).length > 0 || refs.length > 0;
      if (ok) covered++;
      else gaps.push(r);
    });
    return { pct: Math.round(covered / reqs.length * 100), gaps: gaps, total: reqs.length, covered: covered };
  }
  function coverageByTopic(W) {
    var topics = nodesArr(W).filter(function (n) { return n.type === 'topic'; });
    return topics.map(function (t) {
      var desc = subtreeIds(W, t.id);
      var reqs = W.requirements.filter(function (r) { return desc.indexOf(r.sourceNodeId) >= 0; });
      var cov = reqs.length ? reqs.filter(function (r) {
        return (r.implementsIds || []).length || W.edges.some(function (e) { return e.rel === 'implements' && (e.a === r.id || e.b === r.id); });
      }).length / reqs.length : 1;
      return { topic: t, items: desc.length, reqs: reqs.length, cov: Math.round(cov * 100) };
    }).sort(function (a, b) { return a.cov - b.cov; });
  }
  function subtreeIds(W, rootId) {
    var out = [rootId];
    childrenOf(W, rootId).forEach(function (c) { out = out.concat(subtreeIds(W, c.id)); });
    return out;
  }

  /* ---------- negative-space report ---------- */
  var EXPECTED_PAIRS = [
    ['login', ['logout', 'password reset', 'lockout', 'rate limit']],
    ['logout', ['login']],
    ['register', ['email verification', 'password reset']],
    ['password', ['password reset', 'lockout', 'rate limit']],
    ['payment', ['refund', 'receipt', 'failure handling']],
    ['checkout', ['cart', 'refund', 'order history']],
    ['upload', ['file size limit', 'virus scan', 'file type validation']],
    ['search', ['empty results', 'pagination', 'filters']],
    ['admin', ['roles', 'permissions', 'audit log']],
    ['notification', ['preferences', 'unsubscribe']],
    ['email', ['unsubscribe', 'bounce handling']],
    ['api', ['rate limit', 'authentication', 'versioning', 'error codes']],
    ['save', ['load', 'autosave conflict']],
    ['delete', ['confirmation', 'undo', 'soft delete']],
    ['multiplayer', ['reconnect', 'latency handling', 'cheat prevention']],
    ['tutorial', ['skip option']],
    ['settings', ['reset to defaults']],
    ['profile', ['avatar upload', 'privacy']],
    ['chat', ['moderation', 'block', 'report']],
    ['quest', ['quest log', 'abandon quest', 'rewards']],
    ['inventory', ['stack limit', 'sorting']],
    ['combat', ['death handling', 'respawn']],
    ['craft', ['recipe discovery', 'failure']],
    ['achievement', ['notification', 'progress tracking']]
  ];
  function negativeSpace(W) {
    var corpus = ' ' + U.normalize(W.prompts.map(function (p) { return p.text; }).join('\n') + '\n' +
      nodesArr(W, true).map(function (n) { return n.text; }).join('\n')) + ' ';
    var findings = [];
    EXPECTED_PAIRS.forEach(function (pair) {
      if (corpus.indexOf(pair[0]) < 0) return;
      pair[1].forEach(function (exp) {
        if (corpus.indexOf(exp) < 0) findings.push({ trigger: pair[0], missing: exp });
      });
    });
    return findings.slice(0, 40);
  }

  /* ---------- staleness & impact ---------- */
  var IMPACT_RELS = { dependsOn: 1, requires: 1, implements: 1, references: 1, partof: 1, updates: 1 };
  function impactOf(W, nodeId) {
    // All nodes that (transitively) depend on nodeId.
    var seen = {}, queue = [nodeId], out = [];
    while (queue.length) {
      var cur = queue.shift();
      W.edges.forEach(function (e) {
        if (e.b === cur && IMPACT_RELS[e.rel] && !seen[e.a] && e.a !== nodeId) {
          seen[e.a] = 1; queue.push(e.a);
          if (W.nodes[e.a]) out.push(W.nodes[e.a]);
        }
      });
      // children are part of the node
      childrenOf(W, cur).forEach(function (c) {
        if (!seen[c.id] && c.id !== nodeId) { seen[c.id] = 1; queue.push(c.id); out.push(c); }
      });
    }
    return out;
  }
  function markStale(W, nodeId, reason) {
    var impacted = impactOf(W, nodeId);
    impacted.forEach(function (n) {
      n.stale = { flag: true, reason: reason || ('“' + ((W.nodes[nodeId] || {}).title || nodeId) + '” changed.') };
      n.updated = U.nowISO();
    });
    if (impacted.length) PO.store.log('stale', nodeId + ' changed → ' + impacted.length + ' dependent item(s) marked stale.', nodeId);
    return impacted;
  }
  function impactPreview(W, nodeId) {
    var impacted = impactOf(W, nodeId);
    var refs = {};
    impacted.forEach(function (n) {
      (n.tags || []).forEach(function (t) { refs[t] = (refs[t] || 0) + 1; });
    });
    var topTag = Object.keys(refs).sort(function (a, b) { return refs[b] - refs[a]; })[0];
    var msg = 'This edit affects ' + impacted.length + ' item' + (impacted.length === 1 ? '' : 's');
    if (topTag && impacted.length) msg += ', ' + refs[topTag] + ' of which ' + (refs[topTag] === 1 ? 'is' : 'are') + ' tagged “' + topTag + '”';
    return { count: impacted.length, items: impacted, message: msg + '.' };
  }

  /* ---------- search ---------- */
  function searchNodes(W, q, filters) {
    filters = filters || {};
    var qn = U.normalize(q || '');
    var qToks = U.tokenize(q || '');
    var results = [];
    nodesArr(W).forEach(function (n) {
      if (filters.type && filters.type !== 'any' && n.type !== filters.type) return;
      if (filters.status && filters.status !== 'any' && n.status !== filters.status) return;
      if (filters.tag && (n.tags || []).indexOf(filters.tag) < 0) return;
      if (filters.confMin != null && (n.conf || 0) < filters.confMin) return;
      if (filters.dateFrom && n.updated < filters.dateFrom) return;
      if (filters.dateTo && n.updated > filters.dateTo) return;
      if (filters.source && (!n.anchor || n.anchor.promptId !== filters.source)) return;
      var score = 0, why = [];
      if (!qn) { score = 0.1; }
      else {
        var titleN = U.normalize(n.title || ''), textN = U.normalize(n.text || '');
        if (titleN.indexOf(qn) >= 0) { score += 3; why.push('title match'); }
        var hit = 0;
        qToks.forEach(function (t) {
          if (t.length < 2) return;
          if (titleN.indexOf(t) >= 0) hit += 2;
          else if (textN.indexOf(t) >= 0) hit += 1;
          else if ((n.tags || []).join(' ').indexOf(t) >= 0) hit += 1.5;
          else if ((n.entities || []).join(' ').toLowerCase().indexOf(t) >= 0) hit += 1.5;
        });
        score += hit / Math.max(1, qToks.length);
        if ((n.id || '').toLowerCase().indexOf(qn) >= 0) { score += 2; why.push('id match'); }
      }
      if (score > 0.15) results.push({ node: n, score: score, why: why });
    });
    results.sort(function (a, b) { return b.score - a.score; });
    return results.slice(0, 200);
  }
  function expandWithNeighbors(W, results) {
    var seen = {}, out = results.slice();
    results.forEach(function (r) { seen[r.node.id] = 1; });
    results.slice(0, 12).forEach(function (r) {
      neighbors(W, r.node.id).slice(0, 4).forEach(function (n) {
        if (!seen[n.id]) { seen[n.id] = 1; out.push({ node: n, score: 0.1, why: ['neighbor of ' + r.node.id], neighbor: true }); }
      });
    });
    return out;
  }

  /* ---------- prompt lint ---------- */
  function lintPrompt(text) {
    var issues = [];
    var t = String(text || '');
    var words = U.wordsOf(t), paras = t.split(/\n\s*\n/).filter(function (p) { return p.trim(); });
    if (!t.trim()) return { issues: [{ sev: 'err', cat: 'missing', msg: 'The prompt is empty.', fix: 'Paste or type prompt content.' }], counts: {} };
    // clarity: long sentences
    var longS = 0;
    t.split(/[.!?\n]+/).forEach(function (s) { if (U.wordsOf(s) > 45) longS++; });
    if (longS) issues.push({ sev: longS > 4 ? 'warn' : 'info', cat: 'clarity', msg: longS + ' sentence(s) exceed 45 words.', fix: 'Split long sentences into shorter steps.' });
    // ambiguity
    var amb = (t.match(/\b(it|this|that|they|them|thing|stuff|something|somehow|etc\.?|various|several)\b/gi) || []).length;
    if (amb > Math.max(6, words / 60)) issues.push({ sev: 'warn', cat: 'ambiguity', msg: 'High vague-word count (' + amb + ').', fix: 'Replace “it/this/thing/etc.” with concrete nouns.' });
    // missing details: quality words without numbers
    var quals = (t.match(/\b(fast|secure|scalable|robust|user-?friendly|performant|reliable|accurate)\b/gi) || []);
    var nums = (t.match(/\d+\s?(ms|s|sec|min|%|rps|users?|x\b)/gi) || []).length;
    if (quals.length >= 2 && nums === 0) issues.push({ sev: 'warn', cat: 'missing', msg: quals.length + ' quality claims with no measurable target.', fix: 'Add numbers: latency, %, counts.' });
    // placeholders
    var ph = (t.match(/\b(TBD|TODO|FIXME|XXX|\?\?\?|lorem ipsum)\b/gi) || []).length;
    if (ph) issues.push({ sev: 'err', cat: 'missing', msg: ph + ' placeholder(s) (TBD/TODO/???).', fix: 'Resolve placeholders before finalizing.' });
    // structure
    if (paras.length >= 4 && !/^#{1,6}\s+/m.test(t) && !/^\s*([-*+]|\d+[.)])/m.test(t))
      issues.push({ sev: 'info', cat: 'clarity', msg: 'Long prompt with no headings or lists.', fix: 'Add headings and bullets so chunking is cleaner.' });
    // tone: shouting / excessive hedging
    var shout = (t.match(/[A-Z]{6,}/g) || []).length;
    if (shout > 3) issues.push({ sev: 'info', cat: 'tone', msg: 'Many ALL-CAPS words (' + shout + ').', fix: 'Use emphasis sparingly for better model compliance.' });
    var hedge = (t.match(/\b(maybe|perhaps|possibly|might|could|hopefully)\b/gi) || []).length;
    if (hedge > Math.max(4, words / 120)) issues.push({ sev: 'info', cat: 'tone', msg: 'Heavy hedging (' + hedge + ' tentative words).', fix: 'Decide: state requirements plainly.' });
    // readability: avg word length / sentence length
    var sents = t.split(/[.!?]+/).filter(function (s) { return U.wordsOf(s) > 2; });
    var avgLen = sents.length ? sents.reduce(function (a, s) { return a + U.wordsOf(s); }, 0) / sents.length : 0;
    if (avgLen > 28) issues.push({ sev: 'info', cat: 'readability', msg: 'Average sentence length ' + Math.round(avgLen) + ' words.', fix: 'Aim for ~15–20 words per sentence.' });
    // contradictions (surface level)
    var hasMust = /\bmust\b/i.test(t), hasNever = /\bnever\b/i.test(t);
    if (hasMust && hasNever) issues.push({ sev: 'info', cat: 'ambiguity', msg: 'Contains both “must” and “never” — check for contradictions in Review Queue.', fix: 'Review flagged conflicts.' });
    var counts = { err: 0, warn: 0, info: 0 };
    issues.forEach(function (i) { counts[i.sev]++; });
    return { issues: issues, counts: counts, words: words, paras: paras.length, avgSent: Math.round(avgLen) };
  }

  /* ---------- token budget / context ---------- */
  var CONTEXT_PRESETS = [
    { name: 'Small (8k)', ctx: 8192 }, { name: 'Medium (32k)', ctx: 32768 },
    { name: 'Large (128k)', ctx: 128000 }, { name: 'XL (200k)', ctx: 200000 }, { name: 'Max (1M)', ctx: 1000000 }
  ];
  function contextUsage(tokens, ctx) {
    return { tokens: tokens, ctx: ctx, pct: ctx ? Math.round(tokens / ctx * 1000) / 10 : 0 };
  }

  /* ---------- NL Q&A (retrieval over nodes) ---------- */
  function answerQuestion(W, q) {
    var hits = searchNodes(W, q, {}).slice(0, 6);
    if (!hits.length) return { text: 'I could not find anything related in this workspace. Try different keywords or check the Inbox.', hits: [] };
    var tops = hits.slice(0, 3);
    var text = 'Based on ' + hits.length + ' matching item(s), the most relevant ' +
      (tops.length === 1 ? 'is' : 'are') + ' ' +
      tops.map(function (h) { return '“' + h.node.title + '” (' + h.node.id + ')'; }).join(', ') +
      '. Open a result to read the full text and its source anchor.';
    return { text: text, hits: hits };
  }

  /* ---------- review queue ---------- */
  function reviewQueue(W) {
    var items = [];
    nodesArr(W, true).forEach(function (n) {
      var reasons = [];
      if (n.status === 'uncertain') reasons.push({ k: 'uncertain', sev: 'high', label: 'Uncertain placement (inbox)' });
      if (n.status === 'inferred') reasons.push({ k: 'inferred', sev: 'med', label: 'AI-inferred — verify' });
      if (isOrphan(W, n) && n.status !== 'uncertain') reasons.push({ k: 'orphan', sev: 'med', label: 'Orphan — no parent or links' });
      if (n.stale && n.stale.flag) reasons.push({ k: 'stale', sev: 'med', label: 'Stale: ' + (n.stale.reason || 'dependency changed') });
      if (n.status === 'merged') reasons.push({ k: 'merged', sev: 'low', label: 'Merged from duplicates — audit' });
      if ((n.conf || 0) < 0.5 && n.status !== 'uncertain') reasons.push({ k: 'lowconf', sev: 'med', label: 'Low confidence (' + Math.round((n.conf || 0) * 100) + '%)' });
      var conf = W.edges.filter(function (e) { return e.rel === 'conflictsWith' && (e.a === n.id || e.b === n.id); });
      if (conf.length) reasons.push({ k: 'conflict', sev: 'high', label: 'In ' + conf.length + ' conflict(s)' });
      if (!reasons.length) return;
      var impact = impactOf(W, n.id).length;
      var sevRank = { high: 3, med: 2, low: 1 };
      var top = reasons.slice().sort(function (a, b) { return sevRank[b.sev] - sevRank[a.sev]; })[0];
      items.push({ node: n, reasons: reasons, topSev: top.sev, impact: impact, score: sevRank[top.sev] * 100 + Math.min(impact, 99) });
    });
    // unresolved near-duplicate pairs
    var seen = {};
    var arr = nodesArr(W, true);
    for (var i = 0; i < arr.length && items.length < 400; i++) {
      for (var j = i + 1; j < Math.min(arr.length, i + 60); j++) {
        var a = arr[i], b = arr[j];
        if (a.type === 'folder' || b.type === 'folder') continue;
        var key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        if (seen[key]) continue;
        var s = U.similarity(a.text, b.text);
        if (s >= 0.7 && s < 0.9) {
          seen[key] = 1;
          items.push({ node: a, pair: b, reasons: [{ k: 'dup', sev: 'med', label: 'Possible duplicate of ' + b.id + ' (' + Math.round(s * 100) + '%)' }], topSev: 'med', impact: 0, score: 205 });
        }
      }
    }
    items.sort(function (x, y) { return y.score - x.score; });
    return items.slice(0, 300);
  }

  PO.analyze = {
    nodesArr: nodesArr, childrenOf: childrenOf, depthOf: depthOf, maxDepth: maxDepth,
    breadcrumbs: breadcrumbs, backlinks: backlinks, forwardLinks: forwardLinks,
    neighbors: neighbors, isOrphan: isOrphan, orphans: orphans, subtreeIds: subtreeIds,
    stats: stats, health: health, coverage: coverage, coverageByTopic: coverageByTopic,
    negativeSpace: negativeSpace, impactOf: impactOf, markStale: markStale, impactPreview: impactPreview,
    searchNodes: searchNodes, expandWithNeighbors: expandWithNeighbors,
    lintPrompt: lintPrompt, CONTEXT_PRESETS: CONTEXT_PRESETS, contextUsage: contextUsage,
    answerQuestion: answerQuestion, reviewQueue: reviewQueue
  };
})();
