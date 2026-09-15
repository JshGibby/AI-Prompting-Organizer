/* ============================================================
   Prompt Organizer — ingest.js
   Chunking with source anchors, classification, stable IDs,
   duplicate merging, edge inference, tag/entity/requirement extraction.
   Pure-local "AI assist": deterministic heuristics, fully reversible.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  /* ---------- chunking: paragraphs with offsets ---------- */
  function chunkText(text) {
    text = String(text || '').replace(/\r\n/g, '\n');
    var chunks = [], i = 0, n = text.length;
    var paraRe = /([^\n]+(?:\n(?!\n)[^\n]+)*)/g, m;
    // First protect fenced code blocks so they stay whole.
    var fenced = [];
    text = text.replace(/```[\s\S]*?```/g, function (blk) {
      fenced.push(blk);
      return '\n\n\x00F' + (fenced.length - 1) + '\x00\n\n';
    });
    var cursor = 0;
    var parts = text.split(/\n\s*\n/);
    parts.forEach(function (raw) {
      var part = raw.replace(/\x00F(\d+)\x00/g, function (_, k) { return fenced[+k]; });
      var trimmed = part.replace(/^\n+/, '');
      var leadGap = part.length - part.replace(/^\s+/, '').length;
      var start = cursor + leadGap;
      var body = part.trim();
      cursor += raw.length + 2;
      if (!body) return;
      chunks.push({ text: body, start: start, end: start + body.length });
    });
    return chunks;
  }

  function chunkKind(text) {
    var t = text.trim();
    if (/^```[\s\S]*```$/.test(t) || /^(`{1,3}|~~~)/.test(t)) return 'code';
    if (/^#{1,6}\s+/.test(t)) return 'heading';
    if (/^(\s*([-*+]|\d+[.)])\s+)/m.test(t) && t.split('\n').length >= 1) {
      // list block — but a single short line list is still list-like
      return 'list';
    }
    if (/^\|.+\|$/.test(t) || /\n\|/.test(t)) return 'table';
    return 'para';
  }

  /* ---------- classification ---------- */
  var RULES_HARD = /\b(must|shall|required|mandatory|never|forbidden|prohibited|always|constraint|strictly)\b/i;
  var RULES_SOFT = /\b(should|prefer|ideally|encouraged|recommended|optional|nice[- ]to[- ]have)\b/i;
  var FEAT_RE = /\b(feature|capability|support for|allows? (users?|the|you|players?)|users? can|players? can|the system (will|should|must)|functionality|implements?)\b/i;
  var MECH_RE = /\b(mechanic|mechanism|gameplay|loop|cooldown|spawn|damage|health|score|level|xp|experience points|mana|stamina|inventory|quest|craft|combat|turn[- ]based|real[- ]time)\b/i;
  var SCRIPT_RE = /\b(script|function|class|module|api endpoint|endpoint|database schema|sql|code|algorithm|pseudocode|const |let |def |import |function\(|=>|<\/?[a-z][^>]*>|SELECT |INSERT )/i;
  var ASSET_RE = /\b(asset|image|sprite|texture|sound|audio|music|video|diagram|mockup|logo|icon|pdf|attachment|file:|screenshot)\b/i;
  var DOC_RE = /\b(document|documentation|readme|guide|manual|spec(ification)?|proposal|report|policy|terms|faq)\b/i;
  var IDEA_RE = /\b(idea|maybe|perhaps|could|what if|brainstorm|consider|potential|future|eventually|someday|alternative)\b/i;
  var NONG_RE = /\b(out of scope|non[- ]goal|won'?t|will not|explicitly not|no need for|exclude)\b/i;

  function classify(chunk, contextTitle) {
    var t = chunk.text, kind = chunkKind(t);
    if (kind === 'code' || (SCRIPT_RE.test(t) && (kind === 'list' ? t.length > 300 : true) && /[{};=<>]/.test(t))) {
      if (/^```/.test(t.trim()) || /function|const |let |def |class |SELECT|import |=>/.test(t)) return { type: 'script', conf: 0.88, why: 'Contains code or a fenced code block.' };
    }
    if (kind === 'heading') return { type: 'topic', conf: 0.9, why: 'Markdown heading — treated as a topic branch.' };
    if (ASSET_RE.test(t) && /(http|!\[[^\]]*\]\(|\.(png|jpe?g|gif|svg|pdf|mp3|wav|mp4)\b)/i.test(t))
      return { type: 'asset', conf: 0.85, why: 'Mentions an asset with a file reference or link.' };
    var scores = [
      ['rule', RULES_HARD.test(t) ? 0.86 : (RULES_SOFT.test(t) ? 0.62 : 0), 'Contains rule language (must/never/required…).'],
      ['feature', FEAT_RE.test(t) ? 0.78 : 0, 'Describes a capability or feature.'],
      ['mechanic', MECH_RE.test(t) ? 0.74 : 0, 'Describes a mechanic or system behavior.'],
      ['document', DOC_RE.test(t) ? 0.66 : 0, 'Reads like documentation or a referenced doc.'],
      ['asset', ASSET_RE.test(t) ? 0.6 : 0, 'Mentions an asset or media.'],
      ['idea', IDEA_RE.test(t) ? 0.58 : 0, 'Speculative or brainstorming language.'],
      ['topic', 0.45, 'General topical paragraph.']
    ];
    // list blocks lean feature/rule
    if (kind === 'list') { scores[1][1] += 0.06; scores[0][1] += 0.04; }
    if (NONG_RE.test(t)) scores[0][1] = Math.max(scores[0][1], 0.7);
    scores.sort(function (a, b) { return b[1] - a[1]; });
    var top = scores[0];
    if (top[1] < 0.5) return { type: 'topic', conf: 0.4, why: 'No strong signal — placed as a topic; verify in Review Queue.', uncertain: true };
    return { type: top[0], conf: Math.min(0.92, top[1]), why: top[2] };
  }

  function titleFor(chunk, cls, idx) {
    var t = chunk.text.replace(/^#{1,6}\s+/, '').split('\n')[0].trim();
    t = t.replace(/^([-*+]|\d+[.)])\s+/, '').replace(/^```\w*/, '').trim();
    var words = t.split(/\s+/).slice(0, 9).join(' ');
    if (!words) words = cls.type + ' ' + (idx + 1);
    if (words.length > 70) words = words.slice(0, 67) + '…';
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  /* ---------- stable IDs ---------- */
  function makeId(W, type, title) {
    var base = type + '.' + U.slug(title, 36);
    if (!W.nodes[base]) return base;
    var i = 2;
    while (W.nodes[base + '-' + i]) i++;
    return base + '-' + i;
  }

  /* ---------- tags & entities ---------- */
  var TAG_HINTS = ['auth', 'login', 'logout', 'payment', 'checkout', 'search', 'profile', 'admin', 'api',
    'database', 'ui', 'ux', 'mobile', 'desktop', 'security', 'performance', 'testing', 'deploy',
    'onboarding', 'notification', 'email', 'chat', 'ai', 'ml', 'combat', 'inventory', 'quest',
    'multiplayer', 'save', 'settings', 'tutorial', 'audio', 'art', 'level', 'boss', 'economy'];
  function suggestTags(text) {
    var low = ' ' + U.normalize(text) + ' ', out = [];
    TAG_HINTS.forEach(function (h) { if (low.indexOf(h) >= 0) out.push(h); });
    // hashtags
    var m = String(text).match(/#[A-Za-z][\w-]*/g);
    (m || []).forEach(function (h) { var s = h.slice(1).toLowerCase(); if (out.indexOf(s) < 0) out.push(s); });
    return out.slice(0, 8);
  }
  function extractEntities(text) {
    var out = [], seen = {};
    var t = String(text || '');
    // CamelCase / snake_case identifiers
    var m1 = t.match(/\b[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+\b|\b[a-z]+(?:_[a-z0-9]+)+\b/g) || [];
    // Quoted names
    var m2 = t.match(/"([^"\n]{2,40})"|'([^'\n]{2,40})'|`([^`\n]{2,40})`/g) || [];
    // ALL-CAPS acronyms
    var m3 = t.match(/\b[A-Z]{2,6}\b/g) || [];
    m1.concat(m2).concat(m3).forEach(function (e) {
      e = e.replace(/^["'`]|["'`]$/g, '').trim();
      if (e.length < 2 || e.length > 42 || seen[e.toLowerCase()]) return;
      seen[e.toLowerCase()] = 1;
      out.push(e);
    });
    return out.slice(0, 12);
  }

  /* ---------- requirements ---------- */
  function extractRequirements(text) {
    var reqs = [];
    String(text || '').split('\n').forEach(function (line) {
      var l = line.trim().replace(/^([-*+]|\d+[.)])\s+/, '');
      if (l.length < 12) return;
      var kind = null;
      if (NONG_RE.test(l)) kind = 'non-goal';
      else if (RULES_HARD.test(l)) kind = 'hard';
      else if (RULES_SOFT.test(l)) kind = 'soft';
      if (kind) reqs.push({ kind: kind, text: l.slice(0, 300) });
    });
    return reqs.slice(0, 12);
  }

  function askQuestions(text, cls) {
    var q = [], t = String(text || '');
    if (/\b(TBD|TODO|FIXME|XXX|\?\?\?|unclear|unknown|somehow|something like|etc\.?)\b/i.test(t))
      q.push('This passage contains a placeholder or vague term — what exactly is meant?');
    if (/\b(fast|quickly|scalable|secure|user-?friendly|robust|performant)\b/i.test(t) && !/\b(\d+\s?(ms|s|sec|rps|users?|%))\b/i.test(t))
      q.push('A quality claim here has no measurable target — what number defines success?');
    if (cls && cls.uncertain) q.push('The organizer was unsure where this belongs — is the current placement right?');
    if (/\b(may|might|could|possibly|perhaps)\b/i.test(t) && /\b(must|shall|required)\b/i.test(t))
      q.push('This mixes tentative and mandatory language — which parts are hard requirements?');
    return q.slice(0, 3);
  }

  /* ---------- duplicate detection & merge ---------- */
  function findDuplicate(W, text, type, excludeId) {
    var best = null, bestScore = 0;
    Object.keys(W.nodes).forEach(function (id) {
      if (id === excludeId) return;
      var n = W.nodes[id];
      if (n.type === 'folder' || n.type === 'prompt') return;
      var s = U.similarity(text, n.text);
      if (s > bestScore) { bestScore = s; best = n; }
    });
    if (best && bestScore >= 0.82) return { node: best, score: bestScore };
    return null;
  }
  function pickBestVersion(a, b) {
    // Prefer the longer, more specific version; tie-break on earlier creation.
    var sa = (a.text || '').length + (a.entities || []).length * 12 + (a.tags || []).length * 6;
    var sb = (b.text || '').length + (b.entities || []).length * 12 + (b.tags || []).length * 6;
    return sb > sa ? 'b' : 'a';
  }
  function mergeNodes(W, keepId, dropId, reason) {
    var keep = W.nodes[keepId], drop = W.nodes[dropId];
    if (!keep || !drop || keepId === dropId) return null;
    // union tags/entities/aliases
    ['tags', 'entities'].forEach(function (k) {
      (drop[k] || []).forEach(function (v) { if ((keep[k] || []).indexOf(v) < 0) keep[k].push(v); });
    });
    keep.aliases = keep.aliases || [];
    if (keep.aliases.indexOf(drop.title) < 0) keep.aliases.push(drop.title);
    keep.mergedFrom = keep.mergedFrom || [];
    keep.mergedFrom.push({ id: drop.id, title: drop.title, text: drop.text, at: U.nowISO(), reason: reason || 'duplicate' });
    (drop.mergedFrom || []).forEach(function (m) { keep.mergedFrom.push(m); });
    // rewire edges
    W.edges.forEach(function (e) {
      if (e.a === dropId) e.a = keepId;
      if (e.b === dropId) e.b = keepId;
    });
    // move children
    Object.keys(W.nodes).forEach(function (id) {
      var n = W.nodes[id];
      if (n.parent === dropId) n.parent = keepId;
    });
    if (keep.status === 'asserted') keep.status = 'merged';
    keep.updated = U.nowISO(); keep.ver = (keep.ver || 1) + 1;
    W.merges.unshift({ at: U.nowISO(), keep: keepId, dropped: dropId, droppedTitle: drop.title, reason: reason || 'duplicate' });
    delete W.nodes[dropId];
    PO.store.log('merge', 'Merged “' + drop.title + '” into “' + keep.title + '” (' + (reason || 'duplicate') + ')', keepId);
    PO.store.addVersion('merge', 'Merged ' + dropId + ' → ' + keepId, { nodeId: keepId, before: drop.text, after: keep.text });
    return keep;
  }

  /* ---------- edge inference ---------- */
  function inferEdges(W, node) {
    var made = [];
    function add(a, b, rel, note) {
      if (a === b) return;
      var dup = W.edges.some(function (e) { return e.a === a && e.b === b && e.rel === rel; });
      if (dup) return;
      W.edges.push({ id: U.uid('e'), a: a, b: b, rel: rel, note: note || '', auto: true, created: U.nowISO() });
      made.push(rel);
    }
    if (node.parent) add(node.id, node.parent, 'partof', 'Placed in this folder.');
    var t = node.text || '', low = t.toLowerCase();
    // explicit dependency language → link to best matching node by keyword overlap
    var depM = low.match(/\b(depends on|requires?|needs?|relies on|built on)\b([^.\n]{3,80})/);
    if (depM) {
      var target = bestMatchByOverlap(W, node, depM[2]);
      if (target) add(node.id, target.id, 'dependsOn', 'Dependency language: “' + depM[1] + ' …”.');
    }
    // script implements feature: scripts link to feature/topic with best overlap
    if (node.type === 'script') {
      var feat = bestMatchByOverlap(W, node, t, ['feature', 'mechanic', 'topic']);
      if (feat) add(node.id, feat.id, 'implements', 'Script appears to implement this item.');
    }
    // references: title mentions of other nodes
    Object.keys(W.nodes).forEach(function (id) {
      var o = W.nodes[id];
      if (o.id === node.id || o.type === 'folder') return;
      if (o.title && o.title.length > 4 && low.indexOf(o.title.toLowerCase()) >= 0)
        add(node.id, o.id, 'references', 'Text mentions “' + o.title + '”.');
    });
    // shared entities → relatedTo (cap: 3 strongest)
    var rel = [];
    Object.keys(W.nodes).forEach(function (id) {
      var o = W.nodes[id];
      if (o.id === node.id || o.type === 'folder') return;
      var shared = (node.entities || []).filter(function (e) { return (o.entities || []).indexOf(e) >= 0; });
      if (shared.length) rel.push({ o: o, n: shared.length, shared: shared });
    });
    rel.sort(function (a, b) { return b.n - a.n; }).slice(0, 3).forEach(function (r) {
      add(node.id, r.o.id, 'relatedTo', 'Shared entities: ' + r.shared.slice(0, 3).join(', '));
    });
    // conflict detection: "must X" vs "never X"/"no X"
    detectConflicts(W, node, add);
    return made;
  }
  function bestMatchByOverlap(W, node, hintText, types) {
    var ht = U.tokenize(hintText);
    if (!ht.length) return null;
    var best = null, bs = 0;
    Object.keys(W.nodes).forEach(function (id) {
      var o = W.nodes[id];
      if (o.id === node.id || o.type === 'folder') return;
      if (types && types.indexOf(o.type) < 0) return;
      var ot = U.tokenize((o.title || '') + ' ' + (o.text || '').slice(0, 400));
      var os = {};
      ot.forEach(function (w) { os[w] = 1; });
      var hit = ht.filter(function (w) { return os[w]; }).length;
      var score = hit / Math.max(3, ht.length);
      if (score > bs) { bs = score; best = o; }
    });
    return bs >= 0.3 ? best : null;
  }
  function detectConflicts(W, node, add) {
    var musts = [], forbids = [];
    String(node.text || '').split(/[.\n;]+/).forEach(function (s) {
      var l = s.trim().toLowerCase();
      if (!l) return;
      if (/\bmust\b|\bshall\b|\brequired\b|\balways\b/.test(l)) musts.push(l);
      if (/\bnever\b|\bforbidden\b|\bprohibited\b|\bmust not\b|\bshall not\b|\bno [a-z]/i.test(s)) forbids.push(l);
    });
    if (!musts.length && !forbids.length) return;
    Object.keys(W.nodes).forEach(function (id) {
      var o = W.nodes[id];
      if (o.id === node.id || o.type === 'folder') return;
      var ol = (' ' + (o.text || '').toLowerCase() + ' ');
      var hit = musts.some(function (m) {
        var kw = U.tokenize(m).filter(function (w) { return w.length > 3; }).slice(0, 4);
        return kw.length >= 2 && kw.every(function (w) { return ol.indexOf(w) >= 0; }) &&
          /\b(never|not|no |forbidden|prohibit)/.test(ol);
      });
      if (hit) add(node.id, o.id, 'conflictsWith', 'Possible contradiction detected — needs human review.');
    });
  }

  /* ---------- main ingest ---------- */
  function ingestPrompt(W, name, text, opts) {
    opts = opts || {};
    var t = U.nowISO();
    var promptId = opts.promptId || U.uid('prompt');
    var existing = W.prompts.filter(function (p) { return p.id === promptId; })[0];
    var ver;
    if (existing) {
      ver = existing.vers.length + 1;
      existing.vers.push({ v: ver, text: text, at: t, note: opts.note || '' });
      existing.text = text; existing.updated = t;
      PO.store.addVersion('prompt', 'Prompt “' + existing.name + '” updated to v' + ver,
        { promptId: existing.id, before: existing.vers[ver - 2] ? existing.vers[ver - 2].text : '', after: text });
      PO.store.log('prompt-update', '“' + existing.name + '” → v' + ver, null);
    } else {
      existing = { id: promptId, name: name || ('Prompt ' + (W.prompts.length + 1)), text: text, vers: [{ v: 1, text: text, at: t, note: opts.note || 'initial import' }], created: t, updated: t };
      W.prompts.push(existing);
      ver = 1;
      PO.store.addVersion('prompt', 'Prompt “' + existing.name + '” imported (v1)', { promptId: existing.id, after: text });
      PO.store.log('prompt-add', 'Imported prompt “' + existing.name + '”', null);
    }

    // prompt node (one per prompt)
    var promptNodeId = 'prompt.' + U.slug(existing.name, 30);
    if (!W.nodes[promptNodeId]) {
      W.nodes[promptNodeId] = {
        id: promptNodeId, title: existing.name, type: 'prompt', status: 'asserted',
        text: (text || '').slice(0, 600), quote: '',
        anchor: { promptId: existing.id, ver: ver, start: 0, end: Math.min(text.length, 600) },
        parent: 'folder.prompts', tags: suggestTags(text), entities: extractEntities(text),
        conf: 1, created: t, updated: t, ver: 1, why: 'Root node for the imported prompt.',
        stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
      };
    }

    var chunks = chunkText(text);
    var stats = { chunks: chunks.length, created: 0, merged: 0, uncertain: 0, updated: 0, reqs: 0 };
    var currentTopicId = null;
    var batch = {}; // ids created during THIS ingest pass (same-pass dupes merge, not update)

    chunks.forEach(function (ch, idx) {
      var cls = classify(ch);
      var title = titleFor(ch, cls, idx);

      // incremental update: try to match an existing node from this prompt first
      var matched = null, ms = 0;
      if (opts.incremental !== false) {
        Object.keys(W.nodes).forEach(function (id) {
          var n = W.nodes[id];
          if (n.type === 'folder' || !n.anchor || n.anchor.promptId !== existing.id) return;
          var s = U.similarity(ch.text, n.text);
          if (s > ms) { ms = s; matched = n; }
        });
      }
      if (matched && ms >= 0.88) {
        if (batch[matched.id]) {
          // same-pass duplicate: merge with a recorded ledger entry, keep best version
          var candSame = { text: ch.text, entities: extractEntities(ch.text), tags: suggestTags(ch.text) };
          var winnerSame = pickBestVersion(matched, candSame);
          if (winnerSame === 'b') {
            matched.mergedFrom = matched.mergedFrom || [];
            matched.mergedFrom.push({ id: matched.id + '@prev', title: matched.title + ' (previous)', text: matched.text, at: t, reason: 'replaced by better duplicate in same import' });
            matched.text = ch.text;
            matched.quote = ch.text.slice(0, 220);
            matched.anchor = { promptId: existing.id, ver: ver, start: ch.start, end: ch.end };
            matched.updated = t; matched.ver = (matched.ver || 1) + 1;
          } else {
            matched.mergedFrom = matched.mergedFrom || [];
            matched.mergedFrom.push({ id: 'chunk@' + existing.id + ':' + idx, title: title + ' (same-import duplicate)', text: ch.text, at: t, reason: 'duplicate merged on import' });
          }
          if (matched.status === 'asserted') matched.status = 'merged';
          W.merges.unshift({ at: t, keep: matched.id, dropped: '(imported chunk #' + (idx + 1) + ')', droppedTitle: title, reason: 'same-import duplicate ≥88%' });
          PO.store.log('merge', 'Import chunk #' + (idx + 1) + ' merged into ' + matched.id + ' (' + Math.round(ms * 100) + '% similar)', matched.id);
          stats.merged++;
          return;
        }
        // update in place, keep stable ID
        var before = matched.text;
        matched.text = ch.text;
        matched.quote = ch.text.slice(0, 220);
        matched.anchor = { promptId: existing.id, ver: ver, start: ch.start, end: ch.end };
        matched.updated = t; matched.ver = (matched.ver || 1) + 1;
        matched.tags = Array.from(new Set((matched.tags || []).concat(suggestTags(ch.text)))).slice(0, 10);
        matched.entities = Array.from(new Set((matched.entities || []).concat(extractEntities(ch.text)))).slice(0, 14);
        stats.updated++;
        PO.store.addVersion('update', 'Updated ' + matched.id + ' from ' + existing.name + ' v' + ver,
          { nodeId: matched.id, promptId: existing.id, before: before, after: ch.text });
        PO.analyze.markStale(W, matched.id, 'Source paragraph changed in ' + existing.name + ' v' + ver);
        return;
      }
      if (matched && ms >= 0.62 && ms < 0.88) {
        // related but different → keep both, link them
        var tmpId = makeId(W, cls.type, title);
        var tmpNode = buildNode(W, tmpId, title, cls, ch, existing.id, ver, currentTopicId, t);
        W.nodes[tmpId] = tmpNode;
        batch[tmpId] = 1;
        stats.created++;
        W.edges.push({ id: U.uid('e'), a: tmpId, b: matched.id, rel: 'updates', note: 'Similar to existing item (' + Math.round(ms * 100) + '% match) — kept separate, please review.', auto: true, created: t });
        finishNode(W, tmpNode, ch, existing, ver, stats, t);
        if (cls.type === 'topic' && cls.conf >= 0.6) currentTopicId = tmpId;
        return;
      }

      // fresh node — check global duplicates
      var dup = findDuplicate(W, ch.text, cls.type, null);
      if (dup && dup.score >= 0.9) {
        // merge into best version
        var cand = { text: ch.text, entities: extractEntities(ch.text), tags: suggestTags(ch.text) };
        var winner = pickBestVersion(dup.node, cand);
        if (winner === 'b') {
          var oldText = dup.node.text;
          dup.node.text = ch.text;
          dup.node.quote = ch.text.slice(0, 220);
          dup.node.anchor = { promptId: existing.id, ver: ver, start: ch.start, end: ch.end };
          dup.node.updated = t; dup.node.ver = (dup.node.ver || 1) + 1;
          dup.node.mergedFrom = dup.node.mergedFrom || [];
          dup.node.mergedFrom.push({ id: dup.node.id + '@prev', title: dup.node.title + ' (previous)', text: oldText, at: t, reason: 'replaced by better duplicate' });
        } else {
          dup.node.mergedFrom = dup.node.mergedFrom || [];
          dup.node.mergedFrom.push({ id: 'chunk@' + existing.id + ':' + idx, title: title + ' (imported duplicate)', text: ch.text, at: t, reason: 'duplicate merged on import' });
        }
        if (dup.node.status === 'asserted') dup.node.status = 'merged';
        W.merges.unshift({ at: t, keep: dup.node.id, dropped: '(imported chunk #' + (idx + 1) + ')', droppedTitle: title, reason: 'duplicate ≥90% on import' });
        PO.store.log('merge', 'Import chunk #' + (idx + 1) + ' merged into ' + dup.node.id + ' (' + Math.round(dup.score * 100) + '% similar)', dup.node.id);
        stats.merged++;
        return;
      }

      var id = makeId(W, cls.type, title);
      var node = buildNode(W, id, title, cls, ch, existing.id, ver, currentTopicId, t);
      W.nodes[id] = node;
      batch[id] = 1;
      stats.created++;
      if (node.status === 'uncertain') stats.uncertain++;
      finishNode(W, node, ch, existing, ver, stats, t);
      if (cls.type === 'topic' && cls.conf >= 0.6 && node.parent !== 'folder.inbox') currentTopicId = id;
    });

    PO.store.log('ingest', 'Ingested “' + existing.name + '” v' + ver + ': ' + stats.created + ' new, ' + stats.updated + ' updated, ' + stats.merged + ' merged, ' + stats.uncertain + ' uncertain.', promptNodeId);
    return { prompt: existing, ver: ver, stats: stats };
  }

  function buildNode(W, id, title, cls, ch, promptId, ver, currentTopicId, t) {
    var uncertain = !!cls.uncertain || cls.conf < 0.5;
    // Nest non-topic items under the current topic when confident it belongs there;
    // otherwise use the type folder. Headings reset the current topic.
    var parent = PO.store.TYPE_FOLDER[cls.type] || 'folder.topics';
    if (uncertain) parent = 'folder.inbox';
    else if (currentTopicId && W.nodes[currentTopicId] && (cls.type === 'feature' || cls.type === 'mechanic' || cls.type === 'rule' || cls.type === 'idea'))
      parent = currentTopicId;
    if (cls.type === 'topic' && cls.conf >= 0.6) parent = 'folder.topics';
    return {
      id: id, title: title, type: cls.type,
      status: uncertain ? 'uncertain' : (cls.type === 'topic' && cls.conf < 0.65 ? 'inferred' : 'asserted'),
      text: ch.text, quote: ch.text.slice(0, 220),
      anchor: { promptId: promptId, ver: ver, start: ch.start, end: ch.end },
      parent: parent, tags: suggestTags(ch.text), entities: extractEntities(ch.text),
      conf: uncertain ? Math.min(cls.conf, 0.49) : cls.conf,
      created: t, updated: t, ver: 1, why: cls.why,
      stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
    };
  }

  function finishNode(W, node, ch, prompt, ver, stats, t) {
    // inferred nodes MUST carry verbatim quote + valid range, else inbox
    if (node.status === 'inferred') {
      if (!node.quote || !node.anchor || node.anchor.start == null || node.anchor.end <= node.anchor.start) {
        node.status = 'uncertain';
        node.parent = 'folder.inbox';
        node.why += ' Demoted to inbox: inferred item lacked a verbatim quote/range.';
        stats.uncertain++;
      }
    }
    inferEdges(W, node);
    // requirements
    extractRequirements(ch.text).forEach(function (r) {
      var rid = 'req.' + U.slug(r.text, 34);
      if (W.nodes[rid]) { var i = 2; while (W.nodes[rid + '-' + i]) i++; rid = rid + '-' + i; }
      W.nodes[rid] = {
        id: rid, title: r.text.slice(0, 80), type: 'requirement', status: node.status === 'uncertain' ? 'uncertain' : 'inferred',
        text: r.text, quote: r.text,
        anchor: U.deepClone(node.anchor), parent: 'folder.requirements',
        tags: ['requirement', r.kind], entities: [], conf: 0.66,
        created: t, updated: t, ver: 1,
        why: 'Extracted (' + r.kind + ' requirement) from “' + node.title + '”. Assistive — edit or remove freely.',
        stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
      };
      W.requirements.push({ id: rid, kind: r.kind, text: r.text, sourceNodeId: node.id, implementsIds: [], status: 'open', created: t });
      W.edges.push({ id: U.uid('e'), a: rid, b: node.id, rel: 'references', note: 'Extracted from this item.', auto: true, created: t });
      stats.reqs++;
    });
    // questions for unclear areas
    askQuestions(ch.text, { uncertain: node.status === 'uncertain' }).forEach(function (q) {
      W.questions.push({ id: U.uid('q'), nodeId: node.id, q: q, at: t, resolved: false });
    });
  }

  PO.ingest = {
    chunkText: chunkText, chunkKind: chunkKind, classify: classify,
    makeId: makeId, suggestTags: suggestTags, extractEntities: extractEntities,
    extractRequirements: extractRequirements, askQuestions: askQuestions,
    findDuplicate: findDuplicate, mergeNodes: mergeNodes, inferEdges: inferEdges,
    ingestPrompt: ingestPrompt
  };
})();
