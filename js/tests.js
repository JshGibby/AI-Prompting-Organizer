/* ============================================================
   Prompt Organizer — tests.js
   Test cases, transparent scoring, prompt-version comparison,
   output diffing, best-version tracking. Runs offline: paste real
   model outputs, or use the built-in deterministic mock model.
   ============================================================ */
(function () {
  'use strict';
  var U = PO.util;

  var RULES = [
    { id: 'exact', label: 'Exact match' },
    { id: 'contains', label: 'Contains…' },
    { id: 'not_contains', label: 'Does not contain…' },
    { id: 'keywords', label: 'Required keywords (all)' },
    { id: 'forbidden', label: 'Forbidden keywords (none)' },
    { id: 'length', label: 'Length bounds (words min–max)' },
    { id: 'facts', label: 'Required facts (from expected list)' },
    { id: 'manual', label: 'Manual score (0–100)' }
  ];

  function createTest(W, opts) {
    opts = opts || {};
    var id = opts.id || ('test.' + U.slug(opts.name || 'case', 30));
    if (W.nodes[id] || W.tests.some(function (t) { return t.id === id; })) {
      var i = 2;
      while (W.nodes[id + '-' + i] || W.tests.some(function (t) { return t.id === id + '-' + i; })) i++;
      id = id + '-' + i;
    }
    var t = U.nowISO();
    var test = {
      id: id, name: opts.name || 'Untitled case',
      inputText: opts.inputText || '',
      inputRef: opts.inputRef || null, // {promptId, version} or {subtreeRoot}
      expected: opts.expected || { kind: 'text', text: '' },
      scoring: opts.scoring || { rule: 'contains', param: '' },
      linked: opts.linked || [],
      created: t, updated: t
    };
    W.tests.push(test);
    W.nodes[id] = {
      id: id, title: test.name, type: 'test', status: 'asserted',
      text: 'Input:\n' + (test.inputText || '(see reference)').slice(0, 400) + '\n\nExpected (' + test.expected.kind + '):\n' + expectedSummary(test).slice(0, 400),
      quote: '', anchor: null, parent: 'folder.tests',
      tags: ['test'], entities: [], conf: 1, created: t, updated: t, ver: 1,
      why: 'Test case. Stable ID, linked to prompt versions on each run.',
      stale: { flag: false, reason: '' }, mergedFrom: [], aliases: []
    };
    PO.store.log('test-add', 'Test case ' + id + ' created.', id);
    PO.readme.touchParents(W, id);
    return test;
  }

  function expectedSummary(test) {
    var e = test.expected || {};
    if (e.kind === 'facts') return (e.facts || []).join('\n');
    if (e.kind === 'rubric') return (e.criteria || []).map(function (c) { return c.name + ' (×' + c.weight + ')'; }).join('\n');
    return e.text || '';
  }

  function scoreOutput(test, actual, manualScore) {
    actual = String(actual == null ? '' : actual);
    var rule = (test.scoring || {}).rule || 'contains';
    var param = (test.scoring || {}).param;
    var detail = '';
    function res(pass, score) { return { pass: !!pass, score: U.clamp(Math.round(score), 0, 100), detail: detail }; }
    if (rule === 'exact') {
      var exp = (test.expected || {}).text || '';
      var pass = actual.trim() === exp.trim();
      detail = pass ? 'Outputs are identical.' : 'Outputs differ.';
      return res(pass, pass ? 100 : 0);
    }
    if (rule === 'contains') {
      var pass2 = actual.toLowerCase().indexOf(String(param || '').toLowerCase()) >= 0;
      detail = pass2 ? 'Contains “' + param + '”.' : 'Missing “' + param + '”.';
      return res(pass2, pass2 ? 100 : 0);
    }
    if (rule === 'not_contains') {
      var pass3 = actual.toLowerCase().indexOf(String(param || '').toLowerCase()) < 0;
      detail = pass3 ? 'Correctly absent.' : 'Forbidden text present: “' + param + '”.';
      return res(pass3, pass3 ? 100 : 0);
    }
    if (rule === 'keywords') {
      var kws = String(param || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      var low = actual.toLowerCase();
      var missing = kws.filter(function (k) { return low.indexOf(k) < 0; });
      detail = missing.length ? 'Missing: ' + missing.join(', ') : 'All ' + kws.length + ' keywords present.';
      return res(!missing.length, kws.length ? Math.round((kws.length - missing.length) / kws.length * 100) : 0);
    }
    if (rule === 'forbidden') {
      var fws = String(param || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      var low2 = actual.toLowerCase();
      var found = fws.filter(function (k) { return low2.indexOf(k) >= 0; });
      detail = found.length ? 'Forbidden present: ' + found.join(', ') : 'No forbidden keywords.';
      return res(!found.length, !found.length ? 100 : 0);
    }
    if (rule === 'length') {
      var parts = String(param || '').split(',').map(Number);
      var w = U.wordsOf(actual);
      var ok = (isNaN(parts[0]) || w >= parts[0]) && (isNaN(parts[1]) || w <= parts[1]);
      detail = w + ' words (bounds ' + (parts[0] || 0) + '–' + (parts[1] || '∞') + ').';
      return res(ok, ok ? 100 : 0);
    }
    if (rule === 'facts') {
      var facts = (test.expected || {}).facts || [];
      var low3 = actual.toLowerCase();
      var missingF = facts.filter(function (f) { return low3.indexOf(String(f).toLowerCase().slice(0, 40)) < 0; });
      detail = (facts.length - missingF.length) + '/' + facts.length + ' facts present.' + (missingF.length ? ' Missing: ' + missingF.slice(0, 3).join(' / ') : '');
      return res(!missingF.length, facts.length ? Math.round((facts.length - missingF.length) / facts.length * 100) : 0);
    }
    if (rule === 'manual') {
      var s = U.clamp(Number(manualScore) || 0, 0, 100);
      detail = 'Human-assigned score.';
      return res(s >= 60, s);
    }
    return res(false, 0);
  }

  /* Deterministic mock model — lets users exercise the whole eval flow offline.
     It "answers" by retrieving the most relevant prompt chunk. */
  function mockRun(promptText, input, opts) {
    opts = opts || {};
    var seed = (opts.version || 1);
    var chunks = PO.ingest.chunkText(promptText);
    var scored = chunks.map(function (c) { return { c: c, s: U.similarity(c.text, input) }; })
      .sort(function (a, b) { return b.s - a.s; });
    var top = scored.slice(0, 2 + (seed % 2));
    var L = ['[mock-model v' + seed + ' · deterministic offline stand-in]'];
    L.push('Answering: ' + String(input || '').slice(0, 160));
    L.push('');
    top.forEach(function (t, i) {
      L.push('Relevant passage ' + (i + 1) + ' (match ' + Math.round(t.s * 100) + '%):');
      L.push(t.c.text.slice(0, 500));
      L.push('');
    });
    if (!top.length || top[0].s < 0.05) L.push('No strongly relevant passage found in this prompt version.');
    return L.join('\n');
  }

  // promptTextForRun: resolve a test's input ref to concrete prompt text
  function promptTextForRun(W, test, promptId, version) {
    if (test.inputRef && test.inputRef.subtreeRoot && W.nodes[test.inputRef.subtreeRoot]) {
      var col = PO.recompile.collectSubtree(W, test.inputRef.subtreeRoot, { withDeps: true });
      return PO.recompile.buildPrompt(W, col, { budget: 8000, title: 'Eval input' }).md;
    }
    var pid = (test.inputRef && test.inputRef.promptId) || promptId || (W.prompts[0] || {}).id;
    var p = W.prompts.filter(function (x) { return x.id === pid; })[0] || W.prompts[0];
    if (!p) return '';
    var v = version || (test.inputRef && test.inputRef.version) || p.vers.length;
    var vv = p.vers.filter(function (x) { return x.v === v; })[0] || p.vers[p.vers.length - 1];
    return vv ? vv.text : p.text;
  }

  function runAll(W, opts) {
    // opts: {promptId, version, model, manuals:{testId:score}, actuals:{testId:text}, useMock}
    opts = opts || {};
    var t = U.nowISO();
    var testIds = opts.testIds || W.tests.map(function (x) { return x.id; });
    var results = [];
    testIds.forEach(function (tid) {
      var test = W.tests.filter(function (x) { return x.id === tid; })[0];
      if (!test) return;
      var actual;
      if (opts.actuals && opts.actuals[tid] != null) actual = opts.actuals[tid];
      else {
        var ptext = promptTextForRun(W, test, opts.promptId, opts.version);
        actual = mockRun(ptext, test.inputText, { version: opts.version || 1 });
      }
      var r = scoreOutput(test, actual, opts.manuals ? opts.manuals[tid] : 0);
      results.push({ testId: tid, pass: r.pass, score: r.score, detail: r.detail, actual: String(actual).slice(0, 6000) });
      if (test.linked.indexOf('v' + (opts.version || 1)) < 0 && opts.version) test.linked.push('v' + opts.version + '@' + (opts.promptId || 'prompt'));
    });
    var passed = results.filter(function (r) { return r.pass; }).length;
    var run = {
      id: U.uid('run'), at: t, model: opts.model || (opts.actuals ? 'pasted-output' : 'mock-model'),
      promptId: opts.promptId || null, version: opts.version || null,
      passed: passed, total: results.length,
      avg: results.length ? Math.round(results.reduce(function (a, r) { return a + r.score; }, 0) / results.length) : 0,
      results: results
    };
    W.runs.unshift(run);
    PO.store.log('test-run', 'Run ' + run.id + ': ' + passed + '/' + results.length + ' passed (' + run.model + ').', null);
    return run;
  }

  function runsFor(W, promptId, version) {
    return W.runs.filter(function (r) {
      return (!promptId || r.promptId === promptId) && (version == null || r.version === version);
    });
  }
  function bestVersion(W, promptId) {
    var byV = {};
    runsFor(W, promptId, null).forEach(function (r) {
      if (r.version == null) return;
      byV[r.version] = byV[r.version] || { runs: 0, passSum: 0, avgSum: 0 };
      byV[r.version].runs++;
      byV[r.version].passSum += r.passed;
      byV[r.version].avgSum += r.avg;
    });
    var best = null;
    Object.keys(byV).forEach(function (v) {
      var b = byV[v];
      var score = (b.passSum / Math.max(1, b.runs)) * 100 + b.avgSum / Math.max(1, b.runs);
      if (!best || score > best.score) best = { version: +v, score: Math.round(score), runs: b.runs };
    });
    return best;
  }
  function compareRuns(a, b) {
    var mapB = {};
    (b.results || []).forEach(function (r) { mapB[r.testId] = r; });
    return (a.results || []).map(function (ra) {
      var rb = mapB[ra.testId];
      return {
        testId: ra.testId, a: ra, b: rb || null,
        changed: !rb || ra.pass !== rb.pass || ra.score !== rb.score
      };
    });
  }

  PO.tests = {
    RULES: RULES, createTest: createTest, expectedSummary: expectedSummary,
    scoreOutput: scoreOutput, mockRun: mockRun, promptTextForRun: promptTextForRun,
    runAll: runAll, runsFor: runsFor, bestVersion: bestVersion, compareRuns: compareRuns
  };
})();
