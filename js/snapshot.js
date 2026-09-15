/* ============================================================
   Prompt Organizer — snapshot.js
   JSON / ZIP download, upload + merge/replace, single-file HTML
   offline snapshot (works from a USB stick, no AI chat needed).
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  /* ---------- minimal ZIP writer (stored, no compression) ---------- */
  function zipFiles(files) {
    // files: [{name, data:Uint8Array|string}]
    var enc = U.strToBytes;
    var chunks = [], central = [], offset = 0;
    function u16(n) { return [n & 255, (n >> 8) & 255]; }
    function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]; }
    files.forEach(function (f) {
      var data = (typeof f.data === 'string') ? enc(f.data) : f.data;
      var name = enc(f.name);
      var crc = U.crc32(data);
      var head = [].concat(
        [0x50, 0x4b, 0x03, 0x04], u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)
      );
      chunks.push(new Uint8Array(head), name, data);
      central.push({
        head: [].concat([0x50, 0x4b, 0x01, 0x02], u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
          u32(crc), u32(data.length), u32(data.length), u16(name.length),
          u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)),
        name: name
      });
      offset += head.length + name.length + data.length;
    });
    var cdSize = 0;
    central.forEach(function (c) { cdSize += c.head.length + c.name.length; });
    var end = [].concat([0x50, 0x4b, 0x05, 0x06], u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0));
    var total = offset + cdSize + end.length;
    var out = new Uint8Array(total), p = 0;
    function push(b) { out.set(b, p); p += b.length; }
    chunks.forEach(push);
    central.forEach(function (c) { push(new Uint8Array(c.head)); push(c.name); });
    push(new Uint8Array(end));
    return new Blob([out], { type: 'application/zip' });
  }

  function slugFile(s) { return U.slug(s || 'item', 40) || 'item'; }

  function workspaceFileSet(W) {
    var files = [];
    files.push({ name: 'workspace.json', data: JSON.stringify({ app: 'prompt-organizer', schema: 1, exportedAt: U.nowISO(), workspace: W }, null, 1) });
    files.push({ name: 'README.md', data: PO.readme.rootReadme(W) });
    // per-folder readmes mirror the branching file system
    Object.keys(W.nodes).forEach(function (id) {
      var n = W.nodes[id];
      if (n.type === 'folder') files.push({ name: 'readmes/' + id + '.md', data: (W.readmes[id] || {}).md || PO.readme.folderReadme(W, id) });
    });
    // typed folders: scripts/, documents/, assets/, prompts/, requirements/
    function folderNodes(folderId) {
      return PO.analyze.nodesArr(W).filter(function (n) { return n.parent === folderId; });
    }
    folderNodes('folder.scripts').forEach(function (n) {
      files.push({ name: 'scripts/' + slugFile(n.title) + '--' + U.slug(n.id, 40) + '.md',
        data: '# ' + (n.title || n.id) + '\n\n' + (n.text || '') + '\n\n---\n\n- id: `' + n.id + '`\n- parent: `' + (n.parent || '') + '`\n- updated: ' + n.updated + '\n' });
    });
    folderNodes('folder.documents').forEach(function (n) {
      files.push({ name: 'documents/' + slugFile(n.title) + '--' + U.slug(n.id, 40) + '.md',
        data: '# ' + (n.title || n.id) + '\n\n' + (n.text || '') + '\n\n---\n\n- id: `' + n.id + '`\n- parent: `' + (n.parent || '') + '`\n- updated: ' + n.updated + '\n' });
    });
    folderNodes('folder.prompts').forEach(function (n) {
      files.push({ name: 'prompts/' + slugFile(n.title) + '--' + U.slug(n.id, 40) + '.md',
        data: '# ' + (n.title || n.id) + '\n\n' + (n.text || '') + '\n\n---\n\n- id: `' + n.id + '`\n- updated: ' + n.updated + '\n' });
    });
    folderNodes('folder.requirements').forEach(function (n) {
      files.push({ name: 'requirements/' + slugFile(n.title) + '--' + U.slug(n.id, 40) + '.md',
        data: '# ' + (n.title || n.id) + '\n\n> ' + (n.text || '') + '\n\n---\n\n- id: `' + n.id + '`\n- updated: ' + n.updated + '\n' });
    });
    var assets = folderNodes('folder.assets');
    if (assets.length) {
      files.push({ name: 'assets/README.md',
        data: '# Assets\n\nEmbedded asset data is in workspace.json. Items:\n\n' +
          assets.map(function (a) { return '- ' + (a.title || a.id) + ' (`' + a.id + '`)'; }).join('\n') + '\n' });
    }
    files.push({ name: 'graph.json', data: JSON.stringify({ nodes: W.nodes, edges: W.edges }, null, 1) });
    files.push({ name: 'changelog.md', data: '# Changelog\n\n' + W.changelog.map(function (c) { return '- ' + c.at + ' · ' + c.action + ' — ' + c.detail; }).join('\n') });
    files.push({ name: 'manifest.json', data: JSON.stringify(manifest(W), null, 1) });
    return files;
  }
  function manifest(W) {
    var st = PO.analyze.stats(W);
    return {
      app: 'prompt-organizer', exportedAt: U.nowISO(), workspace: W.name,
      stats: st, prompts: W.prompts.map(function (p) { return { name: p.name, versions: p.vers.length, words: U.wordsOf(p.text) }; })
    };
  }
  function downloadJSON() {
    var W = PO.store.W();
    PO.store.log('export', 'Workspace exported as JSON.', null);
    PO.store.persist();
    U.download(safeName(W.name) + '.prompt-organizer.json', PO.store.exportJSON(), 'application/json');
  }
  function downloadZIP() {
    var W = PO.store.W();
    PO.store.log('export', 'Workspace exported as ZIP.', null);
    PO.store.persist();
    var blob = zipFiles(workspaceFileSet(W));
    U.download(safeName(W.name) + '.prompt-organizer.zip', blob, 'application/zip');
  }
  function safeName(n) { return U.slug(n || 'workspace', 40) || 'workspace'; }

  /* ---------- upload ---------- */
  function readUpload(file) {
    return new Promise(function (resolve, reject) {
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var name = (file.name || '').toLowerCase();
          if (name.endsWith('.zip')) {
            var ws = unzipWorkspace(new Uint8Array(rd.result));
            resolve({ kind: 'zip', workspace: ws, name: file.name });
          } else {
            var text = typeof rd.result === 'string' ? rd.result : new TextDecoder().decode(rd.result);
            // HTML snapshot? extract embedded workspace
            var m = text.match(/<script id="snapshot-data" type="application\/json">([\s\S]*?)<\/script>/);
            if (m) {
              var ws2 = JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
              resolve({ kind: 'html', workspace: ws2.workspace || ws2, name: file.name });
            } else {
              resolve({ kind: 'json', workspace: JSON.parse(text), name: file.name });
            }
          }
        } catch (e) { reject(e); }
      };
      rd.onerror = function () { reject(rd.error); };
      if ((file.name || '').toLowerCase().endsWith('.zip')) rd.readAsArrayBuffer(file);
      else rd.readAsText(file);
    });
  }
  // minimal unzip: stored entries only (what our writer produces)
  function unzipWorkspace(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var files = {};
    var p = 0;
    function str(a, b) {
      if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes.slice(a, b));
      var s = '';
      for (var i = a; i < b; i++) s += String.fromCharCode(bytes[i]);
      return decodeURIComponent(escape(s));
    }
    while (p + 30 <= bytes.length) {
      if (dv.getUint32(p, true) !== 0x04034b50) break;
      var method = dv.getUint16(p + 8, true);
      var len = dv.getUint32(p + 18, true);
      var nlen = dv.getUint16(p + 26, true), elen = dv.getUint16(p + 28, true);
      var nm = str(p + 30, p + 30 + nlen);
      var start = p + 30 + nlen + elen;
      if (method !== 0) throw new Error('ZIP uses compression — this snapshot needs stored entries.');
      files[nm] = str(start, start + len);
      p = start + len;
    }
    if (!files['workspace.json']) throw new Error('ZIP has no workspace.json.');
    return JSON.parse(files['workspace.json']);
  }

  function mergeWorkspaces(base, incoming, mode) {
    // mode: 'replace' | 'merge'
    incoming = PO.store.normalizeImported(incoming);
    if (mode === 'replace') return incoming;
    var W = base, t = U.nowISO();
    // prompts: add new versions / new prompts
    (incoming.prompts || []).forEach(function (ip) {
      var ex = W.prompts.filter(function (p) { return p.id === ip.id || p.name === ip.name; })[0];
      if (!ex) { W.prompts.push(ip); return; }
      (ip.vers || []).forEach(function (v) {
        if (!ex.vers.some(function (e) { return e.text === v.text; })) {
          ex.vers.push({ v: ex.vers.length + 1, text: v.text, at: v.at || t, note: 'merged from upload' });
        }
      });
      ex.text = ex.vers[ex.vers.length - 1].text;
      ex.updated = t;
    });
    // nodes: add missing IDs; on conflict keep newer `updated`
    Object.keys(incoming.nodes || {}).forEach(function (id) {
      var nn = incoming.nodes[id], ex = W.nodes[id];
      if (!ex) { W.nodes[id] = nn; return; }
      if ((nn.updated || '') > (ex.updated || '')) W.nodes[id] = nn;
    });
    // edges/tests/runs/requirements/etc: union by id
    [['edges', 'id'], ['tests', 'id'], ['runs', 'id'], ['requirements', 'id'],
     ['queries', 'name'], ['templates', 'name'], ['snippets', 'name'],
     ['snapshots', 'id'], ['questions', 'id']].forEach(function (pair) {
      var k = pair[0], idk = pair[1];
      var have = {};
      (W[k] || []).forEach(function (x) { have[x[idk]] = 1; });
      (incoming[k] || []).forEach(function (x) { if (!have[x[idk]]) W[k].push(x); });
    });
    ['changelog', 'versions', 'merges'].forEach(function (k) {
      W[k] = (incoming[k] || []).concat(W[k] || []).slice(0, 2000);
    });
    Object.keys(incoming.readmes || {}).forEach(function (k) { W.readmes[k] = incoming.readmes[k]; });
    Object.keys(incoming.variables || {}).forEach(function (k) { W.variables[k] = incoming.variables[k]; });
    W.favorites = Array.from(new Set((W.favorites || []).concat(incoming.favorites || [])));
    W.history = (incoming.history || []).concat(W.history || []).slice(0, 60);
    PO.store.log('import', 'Uploaded workspace merged (' + Object.keys(incoming.nodes || {}).length + ' nodes).', null);
    return W;
  }

  /* ---------- single-file HTML snapshot ---------- */
  var JS_FILES = ['util.js', 'store.js', 'ingest.js', 'analyze.js', 'readme.js', 'recompile.js', 'tests.js', 'snapshot.js', 'graph.js', 'ai.js', 'prefs.js', 'suggest.js', 'ui-core.js', 'ui-chat.js', 'ui-tabs-a.js', 'ui-tabs-b.js', 'ui-extra-tabs.js', 'app.js'];
  function buildSnapshotHTML(W) {
    function fetchText(url) {
      return fetch(url, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('fetch ' + url + ' → ' + r.status);
        return r.text();
      });
    }
    return Promise.all([fetchText('css/styles.css')].concat(JS_FILES.map(function (f) { return fetchText('js/' + f); })))
      .then(function (parts) {
        var css = parts[0], js = parts.slice(1).join('\n;\n');
        var wsJson = JSON.stringify({ app: 'prompt-organizer', schema: 1, exportedAt: U.nowISO(), workspace: W })
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        var st = PO.analyze.stats(W);
        var appHTML = document.getElementById('app').outerHTML;
        var shells = '<div id="modalRoot"></div>\n<div id="toasts" aria-live="polite"></div>';
        var html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' +
          '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
          '<title>Snapshot — ' + U.esc(W.name) + '</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' +
          appHTML + '\n' + shells + '\n' +
          '<script id="snapshot-data" type="application/json">' + wsJson + '<\/script>\n' +
          '<script>window.PO_SNAPSHOT_MODE=true;<\/script>\n' +
          '<script>\n' + js + '\n<\/script>\n</body>\n</html>';
        return { html: html, stats: st };
      });
  }
  function downloadSnapshot() {
    var W = PO.store.W();
    PO.store.log('export', 'Offline HTML snapshot produced.', null);
    W.snapshots.unshift({ id: U.uid('snap'), at: U.nowISO(), label: 'snapshot ' + (W.snapshots.length + 1), nodes: Object.keys(W.nodes).length });
    PO.store.persist();
    buildSnapshotHTML(W).then(function (r) {
      U.download(safeName(W.name) + '.snapshot.html', r.html, 'text/html');
      if (PO.ui) PO.ui.toast('Snapshot saved — ' + U.fmtNum(r.html.length) + ' chars, works fully offline.', 'ok');
    }).catch(function (e) {
      if (PO.ui) PO.ui.toast('Snapshot build failed: ' + e.message + ' (serve the app over http first)', 'bad');
    });
  }

  PO.snapshot = {
    downloadJSON: downloadJSON, downloadZIP: downloadZIP, downloadSnapshot: downloadSnapshot,
    readUpload: readUpload, mergeWorkspaces: mergeWorkspaces,
    buildSnapshotHTML: buildSnapshotHTML, manifest: manifest
  };
})();
