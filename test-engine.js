/* Headless engine test — stubs browser globals, exercises the full pipeline. */
'use strict';
const fs = require('fs');
const path = require('path');

// ---- browser stubs ----
const memLS = {};
global.window = global;
global.localStorage = {
  getItem: k => (k in memLS ? memLS[k] : null),
  setItem: (k, v) => { memLS[k] = String(v); },
  removeItem: k => { delete memLS[k]; }
};
// no indexedDB -> store falls back to localStorage

function load(f) {
  const code = fs.readFileSync(path.join(__dirname, 'js', f), 'utf8');
  eval.call(global, code + '\n//# sourceURL=' + f);
}
['util.js', 'store.js', 'ingest.js', 'analyze.js', 'readme.js', 'recompile.js', 'tests.js', 'snapshot.js'].forEach(load);

const U = PO.util;
let fails = 0;
function ok(cond, msg) {
  console.log((cond ? '  PASS ' : '  FAIL ') + msg);
  if (!cond) fails++;
}

const PROMPT = [
  '# Test Game — tiny spec',
  '',
  'Test Game is a tiny roguelike about escaping a dungeon.',
  '',
  '## Combat',
  '',
  'Combat is turn-based with swords and shields.',
  '',
  'The player must never lose items on death. Monsters must scale with depth.',
  '',
  'The player can dodge attacks with precise timing.',
  '',
  '## Login',
  '',
  'Players must log in with email and password to save progress.',
  '',
  'Combat is turn-based with swords and shields.',
  '',
  '```js',
  'function attack(a, b) { return a - b; }',
  '```',
  '',
  'The system should support gamepad input, ideally with remapping.',
  '',
  'Maybe add fishing someday? TBD.',
  '',
  'Players must always keep their items after death.'
].join('\n');

// 1. blank workspace + ingest
const W = PO.store.blankWorkspace('Test WS');
PO.store.S.workspace = W;
const t0 = Date.now();
const res = PO.ingest.ingestPrompt(W, 'Tiny Spec', PROMPT, {});
console.log('ingest stats:', JSON.stringify(res.stats), 'in', (Date.now() - t0) + 'ms');
ok(res.stats.created > 5, 'created multiple nodes (' + res.stats.created + ')');
ok(res.stats.merged >= 1, 'duplicate combat paragraph merged (' + res.stats.merged + ')');
ok(W.merges.length >= 1, 'merge recorded in ledger');
ok(Object.keys(W.nodes).length > 15, 'node count sane (' + Object.keys(W.nodes).length + ')');

// stable IDs
const ids = Object.keys(W.nodes).filter(id => !id.startsWith('folder.'));
ok(ids.every(id => /^[a-z]+\./.test(id)), 'all ids namespaced: ' + ids.slice(0, 4).join(','));

// anchors
const anchored = PO.analyze.nodesArr(W, true).filter(n => n.anchor && n.anchor.start != null);
ok(anchored.length >= res.stats.created - 2, 'source anchors kept (' + anchored.length + ')');
// verbatim check on one anchor
const a0 = anchored[0];
ok(PROMPT.indexOf(a0.text.slice(0, 40)) >= 0, 'verbatim text preserved');

// edges + conflicts
ok(W.edges.length > 5, 'edges inferred (' + W.edges.length + ')');
const rels = {};
W.edges.forEach(e => { rels[e.rel] = (rels[e.rel] || 0) + 1; });
console.log('  rel mix:', JSON.stringify(rels));

// requirements
ok(W.requirements.length >= 2, 'requirements extracted (' + W.requirements.length + ')');
ok(W.requirements.some(r => r.kind === 'hard'), 'hard requirement found');
ok(W.requirements.some(r => r.kind === 'soft'), 'soft requirement found');

// questions
ok(W.questions.length >= 1, 'clarifying questions generated (' + W.questions.length + ')');

// incremental update keeps stable id
const beforeIds = Object.keys(W.nodes).sort().join(',');
const PROMPT2 = PROMPT + '\n\n## Audio\n\nMusic must adapt to combat intensity.';
const res2 = PO.ingest.ingestPrompt(W, 'Tiny Spec', PROMPT2, { promptId: res.prompt.id, incremental: true });
ok(res2.ver === 2, 'second version recorded');
ok(res2.stats.created >= 1 && res2.stats.updated >= 3, 'incremental: new + updated (created=' + res2.stats.created + ' updated=' + res2.stats.updated + ')');

// staleness
const staleCount = PO.analyze.nodesArr(W, true).filter(n => n.stale && n.stale.flag).length;
console.log('  stale after update:', staleCount);
const anyNode = PO.analyze.nodesArr(W, true).filter(n => n.type === 'feature')[0] || PO.analyze.nodesArr(W, true)[0];
const impact = PO.analyze.impactPreview(W, anyNode.id);
ok(typeof impact.message === 'string' && /affects \d+/.test(impact.message), 'impact preview: ' + impact.message);

// health + stats
const st = PO.analyze.stats(W), h = PO.analyze.health(W);
ok(st.nodes > 5 && st.edges > 3, 'stats sane');
ok(h.score >= 0 && h.score <= 100 && h.factors.length === 6, 'health score ' + h.score + '/100 with 6 factors');

// coverage + negative space
const cov = PO.analyze.coverage(W);
console.log('  coverage:', cov.pct + '% gaps=' + cov.gaps.length);
const neg = PO.analyze.negativeSpace(W);
ok(neg.some(g => g.trigger === 'login'), 'negative space flags login w/o logout (' + neg.length + ' findings)');

// lint
const lint = PO.analyze.lintPrompt(PROMPT);
ok(lint.issues.length >= 1, 'lint found issues (' + lint.issues.length + ')');

// search + Q&A
const hits = PO.analyze.searchNodes(W, 'combat', {});
ok(hits.length >= 1, 'search hits (' + hits.length + ')');
const qa = PO.analyze.answerQuestion(W, 'how does combat work');
ok(qa.hits.length >= 1, 'Q&A retrieves nodes');

// review queue
const rq = PO.analyze.reviewQueue(W);
ok(rq.length >= 1, 'review queue non-empty (' + rq.length + ')');
ok(rq[0].score >= rq[rq.length - 1].score, 'review sorted by score');

// readme
const root = PO.readme.rootReadme(W);
ok(root.indexOf('What this is about') >= 0 && root.length > 300, 'root README generated (' + root.length + ' chars)');
PO.readme.regenerateAll(W);
ok(Object.keys(W.readmes).length >= 13, 'folder READMEs cached');

// recompile
const col = PO.recompile.collectSubtree(W, 'folder.root', { withDeps: true });
const out = PO.recompile.buildPrompt(W, col, { budget: 8000, title: 'T' });
ok(out.fits && out.tokens > 50, 'recompile fits budget (' + out.tokens + ' tok, ' + out.included.length + ' in)');
const proof = PO.recompile.noLossDiff(W, 'folder.root', out);
console.log('  no-loss: ' + proof.found.length + '/' + proof.total + ' hard constraints in output');
ok(proof.total === 0 || proof.found.length >= 1, 'no-loss proof runs');
// tight budget forces drops + warnings
const tight = PO.recompile.buildPrompt(W, col, { budget: 120, title: 'T' });
ok(tight.dropped.length > 0, 'tight budget drops with warnings (' + tight.dropped.length + ' dropped, forced=' + tight.forcedDrops.length + ')');

// tests + scoring
const tc = PO.tests.createTest(W, { name: 'mentions dodge', inputText: 'how do I avoid damage', expected: { kind: 'text', text: '' }, scoring: { rule: 'contains', param: 'dodge' } });
ok(tc.id === 'test.mentions-dodge', 'test stable id: ' + tc.id);
const run = PO.tests.runAll(W, { promptId: res.prompt.id, version: 2, model: 'mock-model' });
ok(run.total >= 1, 'mock run executed (' + run.passed + '/' + run.total + ')');
const s1 = PO.tests.scoreOutput(tc, 'you can dodge with timing', 0);
ok(s1.pass && s1.score === 100, 'contains-rule scoring passes');
const best = PO.tests.bestVersion(W, res.prompt.id);
ok(best && best.version === 2, 'best version tracked: v' + (best && best.version));

// persist round-trip via localStorage fallback
PO.store.persist().then(() => {
  const raw = memLS['po.workspace.v1'];
  ok(!!raw && raw.length > 1000, 'persisted to localStorage (' + (raw || '').length + ' chars)');
  // merge workspaces
  const W2 = PO.store.blankWorkspace('Other');
  PO.store.S.workspace = W2;
  PO.ingest.ingestPrompt(W2, 'Other prompt', '## Extra\n\nExtra content here for merge testing.', {});
  const merged = PO.snapshot.mergeWorkspaces(W, JSON.parse(JSON.stringify(W2)), 'merge');
  ok(merged.prompts.length >= 2, 'merge keeps both prompts (' + merged.prompts.length + ')');
  console.log(fails === 0 ? '\nALL ENGINE TESTS PASSED' : '\n' + fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}).catch(e => { console.error('persist failed', e); process.exit(1); });
