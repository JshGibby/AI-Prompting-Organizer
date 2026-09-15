/* ============================================================
   Prompt Organizer — readme.js
   Auto-generated READMEs, glossary, acronyms, index, source map.
   Regenerated on folder change with changelog entries.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  function folderKids(W, folderId) {
    return PO.analyze.childrenOf(W, folderId);
  }
  function folderReadme(W, folderId) {
    var f = W.nodes[folderId];
    if (!f) return '# (missing folder)\n';
    var kids = folderKids(W, folderId);
    var byType = {};
    kids.forEach(function (k) { byType[k.type] = (byType[k.type] || 0) + 1; });
    var L = [];
    L.push('# ' + f.title);
    L.push('');
    L.push('_Auto-generated ' + U.fmtDate(U.nowISO()) + ' — regenerates whenever this folder changes._');
    L.push('');
    L.push('## Purpose');
    L.push(folderPurpose(folderId, f.title));
    L.push('');
    L.push('## Contents (' + kids.length + ' item' + (kids.length === 1 ? '' : 's') + ')');
    if (!kids.length) L.push('_Empty._');
    kids.slice().sort(function (a, b) { return a.title < b.title ? -1 : 1; }).forEach(function (k) {
      var sub = PO.analyze.childrenOf(W, k.id).length;
      L.push('- **' + k.title + '** `' + k.id + '` _' + k.type + '/' + k.status + '_' +
        (sub ? ' (+' + sub + ' nested)' : '') + (k.stale && k.stale.flag ? ' ⚠ stale' : ''));
    });
    L.push('');
    L.push('## Mix');
    var keys = Object.keys(byType);
    L.push(keys.length ? keys.map(function (k) { return byType[k] + '× ' + k; }).join(' · ') : '_—_');
    L.push('');
    var stale = kids.filter(function (k) { return k.stale && k.stale.flag; });
    var unc = kids.filter(function (k) { return k.status === 'uncertain'; });
    if (stale.length || unc.length) {
      L.push('## Needs attention');
      stale.forEach(function (k) { L.push('- ⚠ `' + k.id + '` stale: ' + (k.stale.reason || '')); });
      unc.forEach(function (k) { L.push('- ? `' + k.id + '` uncertain placement'); });
      L.push('');
    }
    return L.join('\n');
  }
  function folderPurpose(id, title) {
    var map = {
      'folder.root': 'Top of the workspace tree. Start here: it summarizes the whole project and points at every branch.',
      'folder.topics': 'Topic branches — the main subject areas the prompt covers.',
      'folder.features': 'Features — capabilities the project should have.',
      'folder.mechanics': 'Mechanics — rules of behavior, loops, and systems.',
      'folder.rules': 'Rules — hard constraints and policies.',
      'folder.ideas': 'Ideas — speculative, optional, or future material.',
      'folder.scripts': 'Scripts and code extracted from the prompt.',
      'folder.assets': 'Assets — images, diagrams, files referenced by the prompt.',
      'folder.documents': 'Documents — specs, guides, and long-form references.',
      'folder.prompts': 'Imported prompts and their versions.',
      'folder.tests': 'Test cases that exercise prompt versions.',
      'folder.requirements': 'Extracted hard requirements, soft preferences, and non-goals.',
      'folder.inbox': 'Inbox — items the organizer was unsure about. Review and re-parent them.'
    };
    return map[id] || ('Folder “' + title + '” created by the user.');
  }

  function rootReadme(W) {
    var A = PO.analyze, st = A.stats(W);
    var topics = A.nodesArr(W).filter(function (n) { return n.type === 'topic'; });
    var feats = A.nodesArr(W).filter(function (n) { return n.type === 'feature'; });
    var L = [];
    L.push('# ' + (W.name || 'Workspace') + ' — Project Overview');
    L.push('');
    L.push('_Auto-generated ' + U.fmtDate(U.nowISO()) + ' · ' + st.nodes + ' items · ' + st.edges + ' connections · health ' + A.health(W).score + '/100_');
    L.push('');
    L.push('## What this is about');
    L.push(projectAbout(W));
    L.push('');
    L.push('## Features included (' + feats.length + ')');
    if (!feats.length) L.push('_None extracted yet._');
    feats.slice(0, 20).forEach(function (f) { L.push('- **' + f.title + '** `' + f.id + '`'); });
    if (feats.length > 20) L.push('- …and ' + (feats.length - 20) + ' more.');
    L.push('');
    L.push('## What is connected');
    var relCounts = {};
    W.edges.forEach(function (e) { relCounts[e.rel] = (relCounts[e.rel] || 0) + 1; });
    var rk = Object.keys(relCounts);
    L.push(rk.length ? rk.map(function (k) { return relCounts[k] + '× ' + (PO.store.REL_LABEL[k] || k); }).join(' · ') : '_No connections yet._');
    L.push('');
    L.push('## Where things branch');
    if (!topics.length) L.push('_No topic branches yet — import a prompt to begin._');
    topics.forEach(function (t) {
      var kids = A.childrenOf(W, t.id).length;
      L.push('- **' + t.title + '** `' + t.id + '` — ' + kids + ' nested item(s)');
    });
    L.push('');
    L.push('## Prompts in this workspace');
    W.prompts.forEach(function (p) {
      L.push('- **' + p.name + '** — v' + p.vers.length + ', ' + U.wordsOf(p.text) + ' words, ~' + U.fmtNum(U.tokenEstimate(p.text)) + ' tokens');
    });
    if (!W.prompts.length) L.push('_None yet._');
    L.push('');
    L.push('## Health & attention');
    L.push('- Orphaned: ' + st.orphans + ' · Uncertain: ' + st.uncertain + ' · Stale: ' + st.stale + ' · Conflicts: ' + st.conflicts + ' · Merged duplicates: ' + st.merged);
    L.push('');
    return L.join('\n');
  }

  function projectAbout(W) {
    // Derive a 2–3 sentence "about" from top topics + prompt ledes.
    var A = PO.analyze;
    var topics = A.nodesArr(W).filter(function (n) { return n.type === 'topic' && n.parent === 'folder.topics'; }).slice(0, 5);
    var lede = W.prompts.length ? W.prompts[0].text.split(/\n\s*\n/).filter(function (p) { return p.trim(); })[0] || '' : '';
    lede = lede.replace(/^#{1,6}\s+/, '').slice(0, 400);
    var s = '';
    if (lede) s += lede + (lede.length >= 400 ? '…' : '') + '\n\n';
    if (topics.length) s += 'Main branches: ' + topics.map(function (t) { return '**' + t.title + '**'; }).join(', ') + '.';
    else if (!lede) s += '_Import a prompt to generate this overview._';
    return s;
  }

  function regenerateFolder(W, folderId, why) {
    var md = folderId === 'folder.root' ? rootReadme(W) : folderReadme(W, folderId);
    var prev = W.readmes[folderId];
    W.readmes[folderId] = { at: U.nowISO(), md: md };
    if (prev && prev.md !== md) {
      PO.store.log('readme', 'README regenerated for ' + folderId + (why ? ' — ' + why : ''), folderId);
    }
    return md;
  }
  function regenerateAll(W) {
    Object.keys(W.nodes).forEach(function (id) {
      if (W.nodes[id].type === 'folder') regenerateFolder(W, id, 'full refresh');
    });
  }
  function touchParents(W, nodeId) {
    // regenerate READMEs up the ancestry chain
    var trail = PO.analyze.breadcrumbs(W, nodeId);
    trail.forEach(function (n) { if (n.type === 'folder') regenerateFolder(W, n.id, 'contents changed'); });
  }

  /* ---------- glossary / acronyms / index / source map ---------- */
  function glossary(W) {
    // entities + requirement-ish nouns with their defining node
    var rows = [];
    PO.analyze.nodesArr(W, true).forEach(function (n) {
      (n.entities || []).forEach(function (e) {
        rows.push({ term: e, node: n });
      });
    });
    var seen = {}, out = [];
    rows.forEach(function (r) {
      var k = r.term.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      var def = (r.node.text || '').split(/[.\n]/).filter(function (s) { return s.toLowerCase().indexOf(k) >= 0; })[0] || '';
      out.push({ term: r.term, def: def.trim().slice(0, 220), nodeId: r.node.id });
    });
    out.sort(function (a, b) { return a.term.toLowerCase() < b.term.toLowerCase() ? -1 : 1; });
    return out.slice(0, 300);
  }
  function acronyms(W) {
    var set = {};
    PO.analyze.nodesArr(W, true).forEach(function (n) {
      var m = String(n.text || '').match(/\b[A-Z]{2,6}\b/g) || [];
      m.forEach(function (a) {
        if (!set[a]) {
          // look for "Full Name (ACR)" nearby in workspace
          var full = '';
          var re = new RegExp('([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,4})\\s*\\(' + a + '\\)');
          var mm = String(n.text || '').match(re);
          if (mm) full = mm[1];
          set[a] = { acr: a, full: full, nodeId: n.id };
        }
      });
    });
    return Object.keys(set).sort().map(function (k) { return set[k]; }).slice(0, 200);
  }
  function indexDocs(W) {
    var rows = PO.analyze.nodesArr(W, true).map(function (n) {
      return { id: n.id, title: n.title, type: n.type, status: n.status, tags: n.tags || [] };
    });
    rows.sort(function (a, b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1; });
    return rows;
  }
  function sourceMap(W) {
    return W.prompts.map(function (p) {
      var anchors = [];
      PO.analyze.nodesArr(W, true).forEach(function (n) {
        if (n.anchor && n.anchor.promptId === p.id) anchors.push({ nodeId: n.id, title: n.title, start: n.anchor.start, end: n.anchor.end, ver: n.anchor.ver });
      });
      anchors.sort(function (a, b) { return a.start - b.start; });
      return { prompt: p, anchors: anchors };
    });
  }

  // Minimal markdown → HTML for README rendering
  function mdToHTML(md) {
    var lines = String(md || '').split('\n'), html = [], inList = false;
    function inline(s) {
      s = U.esc(s);
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/_([^_]+)_/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      return s;
    }
    lines.forEach(function (ln) {
      if (/^\s*-\s+/.test(ln)) {
        if (!inList) { html.push('<ul>'); inList = true; }
        html.push('<li>' + inline(ln.replace(/^\s*-\s+/, '')) + '</li>');
      } else {
        if (inList) { html.push('</ul>'); inList = false; }
        var h = ln.match(/^(#{1,4})\s+(.*)/);
        if (h) html.push('<h' + (h[1].length + 1) + '>' + inline(h[2]) + '</h' + (h[1].length + 1) + '>');
        else if (ln.trim() === '') html.push('');
        else html.push('<p>' + inline(ln) + '</p>');
      }
    });
    if (inList) html.push('</ul>');
    return html.join('\n');
  }

  PO.readme = {
    folderReadme: folderReadme, rootReadme: rootReadme,
    regenerateFolder: regenerateFolder, regenerateAll: regenerateAll, touchParents: touchParents,
    glossary: glossary, acronyms: acronyms, indexDocs: indexDocs, sourceMap: sourceMap,
    mdToHTML: mdToHTML
  };
})();
