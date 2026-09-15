/* ============================================================
   Prompt Organizer — store.js
   Workspace state, per-user persistence (IndexedDB + localStorage
   fallback), changelog + version ledger, export/import primitives.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  var DB_NAME = 'prompt-organizer';
  var LS_KEY = 'po.workspace.v1';
  var LS_USER = 'po.userId.v1';

  var S = {
    userId: null,
    workspace: null,   // active workspace object
    dirty: false,
    saveTimer: null,
    snapshotMode: false
  };

  var NODE_TYPES = ['topic', 'feature', 'mechanic', 'rule', 'idea', 'script', 'asset', 'document', 'prompt', 'test', 'requirement', 'folder'];
  var STATUSES = ['asserted', 'inferred', 'merged', 'uncertain'];
  var RELS = ['partof', 'dependsOn', 'implements', 'requires', 'references', 'updates', 'conflictsWith', 'exampleOf', 'relatedTo'];
  var REL_LABEL = {
    partof: 'part of', dependsOn: 'depends on', implements: 'implements', requires: 'requires',
    references: 'references', updates: 'updates', conflictsWith: 'conflicts with',
    exampleOf: 'example of', relatedTo: 'related to'
  };

  var SYSTEM_FOLDERS = [
    ['folder.root', 'Workspace Root', null],
    ['folder.topics', 'Topics', 'folder.root'],
    ['folder.features', 'Features', 'folder.root'],
    ['folder.mechanics', 'Mechanics', 'folder.root'],
    ['folder.rules', 'Rules', 'folder.root'],
    ['folder.ideas', 'Ideas', 'folder.root'],
    ['folder.scripts', 'Scripts', 'folder.root'],
    ['folder.assets', 'Assets', 'folder.root'],
    ['folder.documents', 'Documents', 'folder.root'],
    ['folder.prompts', 'Prompts', 'folder.root'],
    ['folder.tests', 'Tests', 'folder.root'],
    ['folder.requirements', 'Requirements', 'folder.root'],
    ['folder.inbox', 'Inbox (needs review)', 'folder.root']
  ];
  var TYPE_FOLDER = {
    topic: 'folder.topics', feature: 'folder.features', mechanic: 'folder.mechanics',
    rule: 'folder.rules', idea: 'folder.ideas', script: 'folder.scripts',
    asset: 'folder.assets', document: 'folder.documents', prompt: 'folder.prompts',
    test: 'folder.tests', requirement: 'folder.requirements', folder: 'folder.root'
  };

  function getUserId() {
    if (S.userId) return S.userId;
    try {
      var id = localStorage.getItem(LS_USER);
      if (!id) { id = 'user.' + Math.random().toString(36).slice(2, 10); localStorage.setItem(LS_USER, id); }
      S.userId = id;
    } catch (e) { S.userId = S.userId || 'user.local'; }
    return S.userId;
  }

  function blankWorkspace(name) {
    var t = U.nowISO();
    var W = {
      schema: 1,
      id: U.uid('ws'),
      name: name || 'Untitled Workspace',
      createdAt: t, updatedAt: t,
      userId: getUserId(),
      prompts: [],
      nodes: {},
      edges: [],
      changelog: [],
      versions: [],
      queries: [],
      templates: [],
      snippets: [],
      variables: {},
      tests: [],
      runs: [],
      requirements: [],
      merges: [],
      questions: [],
      snapshots: [],
      favorites: [],
      history: [],
      readmes: {},
      tabs: { main: 'dashboard', side: 'tree', pinned: [] },
      seq: 1
    };
    SYSTEM_FOLDERS.forEach(function (f) {
      W.nodes[f[0]] = {
        id: f[0], title: f[1], type: 'folder', status: 'asserted',
        text: '', quote: '', anchor: null, parent: f[2],
        tags: ['system'], entities: [], conf: 1,
        created: t, updated: t, ver: 1, why: 'System folder.',
        stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
      };
    });
    return W;
  }

  function W() { return S.workspace; }
  function touch() {
    if (!S.workspace) return;
    S.workspace.updatedAt = U.nowISO();
    S.dirty = true;
    if (PO.ui && PO.ui.markDirty) PO.ui.markDirty();
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(persist, 1200);
  }

  function log(action, detail, nodeId, actor) {
    var W = S.workspace; if (!W) return;
    W.changelog.unshift({ at: U.nowISO(), actor: actor || 'you', action: action, detail: detail || '', nodeId: nodeId || null });
    if (W.changelog.length > 2000) W.changelog.length = 2000;
  }
  function addVersion(kind, summary, opts) {
    var W = S.workspace; if (!W) return null;
    opts = opts || {};
    var v = {
      id: U.uid('ver'), n: W.versions.length + 1, at: U.nowISO(),
      kind: kind, summary: summary,
      nodeId: opts.nodeId || null, promptId: opts.promptId || null,
      before: opts.before || '', after: opts.after || ''
    };
    W.versions.unshift(v);
    if (W.versions.length > 1500) W.versions.length = 1500;
    return v;
  }
  function pushHistory(nodeId) {
    var W = S.workspace; if (!W || !nodeId) return;
    W.history = W.history.filter(function (h) { return h !== nodeId; });
    W.history.unshift(nodeId);
    if (W.history.length > 60) W.history.length = 60;
  }

  /* ---------- IndexedDB layer ---------- */
  function idb() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) return reject(new Error('no-idb'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('workspaces')) db.createObjectStore('workspaces', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbPut(store, val) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(val);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbGet(store, key) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var rq = tx.objectStore(store).get(key);
        rq.onsuccess = function () { resolve(rq.result || null); };
        rq.onerror = function () { reject(rq.error); };
      });
    });
  }
  function idbAll(store) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, 'readonly');
        var rq = tx.objectStore(store).getAll();
        rq.onsuccess = function () { resolve(rq.result || []); };
        rq.onerror = function () { reject(rq.error); };
      });
    });
  }

  function persist() {
    if (!S.workspace || S.snapshotMode) return Promise.resolve(false);
    clearTimeout(S.saveTimer);
    var payload;
    try { payload = JSON.stringify(S.workspace); } catch (e) { return Promise.resolve(false); }
    // localStorage fast path (may fail on quota — IDB is the durable path)
    try { localStorage.setItem(LS_KEY, payload.slice(0, 4500000)); } catch (e) { /* quota — IDB keeps it */ }
    return idbPut('workspaces', S.workspace).then(function () {
      return idbPut('kv', { k: 'active:' + getUserId(), v: S.workspace.id });
    }).then(function () {
      S.dirty = false;
      if (PO.ui && PO.ui.markClean) PO.ui.markClean();
      return true;
    }).catch(function () {
      try { localStorage.setItem(LS_KEY, payload); S.dirty = false; if (PO.ui && PO.ui.markClean) PO.ui.markClean(); return true; }
      catch (e2) { return false; }
    });
  }

  function restore() {
    // Prefer IDB active workspace for this user, else localStorage.
    return idbGet('kv', 'active:' + getUserId()).then(function (row) {
      if (row && row.v) return idbGet('workspaces', row.v);
      return null;
    }).catch(function () { return null; }).then(function (ws) {
      if (ws && ws.nodes) return ws;
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (raw) { var w2 = JSON.parse(raw); if (w2 && w2.nodes) return w2; }
      } catch (e) { /* ignore */ }
      return null;
    });
  }
  function listWorkspaces() {
    return idbAll('workspaces').catch(function () { return []; });
  }

  function setWorkspace(ws) {
    S.workspace = ws;
    S.dirty = true;
    touch();
  }

  function exportJSON() {
    return JSON.stringify({ app: 'prompt-organizer', schema: 1, exportedAt: U.nowISO(), workspace: S.workspace }, null, 1);
  }

  function normalizeImported(obj) {
    var ws = obj && obj.workspace ? obj.workspace : obj;
    if (!ws || !ws.nodes || !ws.prompts) throw new Error('Not a Prompt Organizer workspace file.');
    ws.schema = 1;
    ['edges', 'changelog', 'versions', 'queries', 'templates', 'snippets', 'tests', 'runs',
     'requirements', 'merges', 'questions', 'snapshots', 'favorites', 'history'].forEach(function (k) {
      if (!Array.isArray(ws[k])) ws[k] = [];
    });
    ws.variables = ws.variables || {};
    ws.readmes = ws.readmes || {};
    ws.tabs = ws.tabs || { main: 'dashboard', side: 'tree', pinned: [] };
    ws.seq = ws.seq || 1;
    SYSTEM_FOLDERS.forEach(function (f) {
      if (!ws.nodes[f[0]]) {
        var t = U.nowISO();
        ws.nodes[f[0]] = {
          id: f[0], title: f[1], type: 'folder', status: 'asserted', text: '', quote: '',
          anchor: null, parent: f[2], tags: ['system'], entities: [], conf: 1,
          created: t, updated: t, ver: 1, why: 'System folder.',
          stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
        };
      }
    });
    return ws;
  }

  PO.store = {
    S: S, NODE_TYPES: NODE_TYPES, STATUSES: STATUSES, RELS: RELS, REL_LABEL: REL_LABEL,
    SYSTEM_FOLDERS: SYSTEM_FOLDERS, TYPE_FOLDER: TYPE_FOLDER,
    getUserId: getUserId, blankWorkspace: blankWorkspace, W: W,
    touch: touch, log: log, addVersion: addVersion, pushHistory: pushHistory,
    persist: persist, restore: restore, listWorkspaces: listWorkspaces,
    setWorkspace: setWorkspace, exportJSON: exportJSON, normalizeImported: normalizeImported
  };
})();
