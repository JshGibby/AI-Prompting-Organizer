/* ============================================================
   Prompt Organizer — recompile.js
   Subtree → clean prompt: dependency pull-in, token budget fit,
   system/task/example separation, no-loss diff proof.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  function collectSubtree(W, rootId, opts) {
    opts = opts || {};
    var ids = PO.analyze.subtreeIds(W, rootId);
    var set = {};
    ids.forEach(function (id) { set[id] = 'subtree'; });
    if (opts.withDeps) {
      // pull every dependency (dependsOn/requires/implements/references targets)
      var frontier = ids.slice();
      var guard = 0;
      while (frontier.length && guard++ < 500) {
        var cur = frontier.shift();
        W.edges.forEach(function (e) {
          if ((e.a === cur) && !set[e.b] && W.nodes[e.b] &&
            (e.rel === 'dependsOn' || e.rel === 'requires' || e.rel === 'implements' || e.rel === 'references')) {
            set[e.b] = 'dependency';
            frontier.push(e.b);
          }
        });
      }
    }
    return Object.keys(set).map(function (id) { return { node: W.nodes[id], via: set[id] }; })
      .filter(function (r) { return r.node && r.node.type !== 'folder'; });
  }

  function sectionFor(node) {
    // system context vs task instructions vs examples
    if (node.type === 'rule' || node.type === 'topic') return 'system';
    if (node.type === 'example' || /example/i.test(node.title || '')) return 'examples';
    if (node.type === 'script' && /example|sample|demo/i.test(node.text || '')) return 'examples';
    return 'task';
  }

  function buildPrompt(W, collected, opts) {
    opts = opts || {};
    var budget = opts.budget || 8000;
    var sys = [], task = [], ex = [];
    collected.forEach(function (c) {
      var sec = sectionFor(c.node);
      var block = { node: c.node, via: c.via, text: blockText(c.node, opts) };
      if (sec === 'system') sys.push(block);
      else if (sec === 'examples') ex.push(block);
      else task.push(block);
    });
    // order: deterministic — system, task (features→mechanics→rules→rest), examples
    var order = { feature: 1, mechanic: 2, rule: 3, requirement: 4, idea: 5, document: 6, script: 7, asset: 8, topic: 9, prompt: 10, test: 11 };
    task.sort(function (a, b) { return (order[a.node.type] || 50) - (order[b.node.type] || 50); });

    var header = '# ' + (opts.title || 'Recompiled Prompt') + '\n_Recompiled from ' + collected.length +
      ' workspace item(s)' + (opts.withDeps ? ' (subtree + dependencies)' : ' (subtree only)') + ' on ' + U.fmtDate(U.nowISO()) + '_\n';
    var parts = [header];
    function section(title, blocks) {
      if (!blocks.length) return null;
      var L = ['## ' + title, ''];
      blocks.forEach(function (b) { L.push(b.text); L.push(''); });
      return { title: title, md: L.join('\n'), blocks: blocks };
    }
    var sections = [
      section('System context', sys),
      section('Task instructions', task),
      section('Examples', ex)
    ].filter(Boolean);

    // budget fit: drop lowest-priority blocks first, but NEVER silently drop hard constraints
    var full = parts.concat(sections.map(function (s) { return s.md; })).join('\n');
    var tokens = U.tokenEstimate(full);
    var dropped = [];
    if (tokens > budget) {
      // priority: keep requirements/rules (hard), then task order; drop ideas/examples/assets first
      var all = [].concat(ex, task, sys);
      var droppable = all.filter(function (b) {
        return !(b.node.type === 'rule' || b.node.type === 'requirement' ||
          (b.node.tags || []).indexOf('hard') >= 0);
      });
      // drop from the END of each section's tail first? simpler: drop droppable in reverse priority
      droppable.sort(function (a, b) {
        var pa = dropPriority(a.node), pb = dropPriority(b.node);
        return pb - pa; // highest drop-priority first
      });
      var kept = {};
      all.forEach(function (b) { kept[b.node.id] = true; });
      for (var i = 0; i < droppable.length && tokens > budget; i++) {
        kept[droppable[i].node.id] = false;
        dropped.push(droppable[i].node);
      }
      sections = sections.map(function (s) {
        var kb = s.blocks.filter(function (b) { return kept[b.node.id]; });
        return kb.length ? { title: s.title, blocks: kb, md: ['## ' + s.title, ''].concat(kb.map(function (b) { return b.text + '\n'; })).join('\n') } : null;
      }).filter(Boolean);
      full = parts.concat(sections.map(function (s) { return s.md; })).join('\n');
      tokens = U.tokenEstimate(full);
      // if STILL over budget, hard constraints must be dropped → warn loudly
      if (tokens > budget) {
        var hard = all.filter(function (b) { return kept[b.node.id]; })
          .sort(function (a, b) { return U.tokenEstimate(b.text) - U.tokenEstimate(a.text); });
        for (var j = 0; j < hard.length && tokens > budget; j++) {
          kept[hard[j].node.id] = false;
          hard[j].forced = true;
          dropped.push(hard[j].node);
        }
        sections = sections.map(function (s) {
          var kb2 = s.blocks.filter(function (b) { return kept[b.node.id]; });
          return kb2.length ? { title: s.title, blocks: kb2, md: ['## ' + s.title, ''].concat(kb2.map(function (b) { return b.text + '\n'; })).join('\n') } : null;
        }).filter(Boolean);
        full = parts.concat(sections.map(function (s) { return s.md; })).join('\n');
        tokens = U.tokenEstimate(full);
      }
    }
    var forcedDrops = dropped.filter(function (n) { return n.type === 'rule' || n.type === 'requirement'; });
    return {
      md: full, tokens: tokens, budget: budget,
      sections: sections.map(function (s) { return s.title; }),
      included: sections.reduce(function (a, s) { return a.concat(s.blocks.map(function (b) { return b.node.id; })); }, []),
      dropped: dropped.map(function (n) { return n.id; }),
      forcedDrops: forcedDrops.map(function (n) { return n.id; }),
      fits: tokens <= budget
    };
  }
  function dropPriority(node) {
    // higher = dropped first
    if (node.type === 'idea') return 100;
    if (node.type === 'example') return 95;
    if (node.type === 'asset') return 90;
    if (node.type === 'document') return 80;
    if (node.status === 'uncertain') return 75;
    if (node.type === 'script') return 40;
    if (node.type === 'topic') return 30;
    if (node.type === 'mechanic') return 20;
    if (node.type === 'feature') return 10;
    return 5; // rules/requirements last
  }
  function blockText(node, opts) {
    var L = ['### ' + node.title + ' `' + node.id + '`'];
    L.push('');
    L.push(node.text);
    if (opts && opts.withAnchors && node.anchor) {
      L.push('');
      L.push('_Source: chars ' + node.anchor.start + '–' + node.anchor.end + ' · confidence ' + Math.round((node.conf || 0) * 100) + '%_');
    }
    return L.join('\n');
  }

  /* ---------- no-loss proof ---------- */
  function noLossDiff(W, rootId, compiled) {
    // Every requirement + rule in the subtree must appear (by key-phrase) in output.
    var ids = PO.analyze.subtreeIds(W, rootId);
    var must = [];
    ids.forEach(function (id) {
      var n = W.nodes[id];
      if (!n || n.type === 'folder') return;
      if (n.type === 'rule' || n.type === 'requirement' || (n.tags || []).indexOf('hard') >= 0) must.push(n);
    });
    var out = U.normalize(compiled.md);
    var missing = [], found = [];
    must.forEach(function (n) {
      var keys = U.tokenize(n.text).filter(function (w) { return w.length > 3; });
      // coverage = fraction of distinctive tokens present
      var need = keys.slice(0, 12);
      if (!need.length) { found.push(n); return; }
      var hit = need.filter(function (w) { return out.indexOf(w) >= 0; }).length;
      (hit / need.length >= 0.7 ? found : missing).push(n);
    });
    // line-level diff between concatenated source paragraphs and output (informational)
    var srcLines = [];
    ids.forEach(function (id) {
      var n = W.nodes[id];
      if (n && n.type !== 'folder') srcLines.push('[' + id + '] ' + (n.text || '').split('\n')[0]);
    });
    return { total: must.length, found: found, missing: missing, srcLines: srcLines };
  }

  PO.recompile = {
    collectSubtree: collectSubtree, buildPrompt: buildPrompt, noLossDiff: noLossDiff, sectionFor: sectionFor
  };
})();
