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
['util.js', 'store.js', 'ingest.js', 'analyze.js', 'readme.js', 'recompile.js', 'tests.js', 'ai.js', 'snapshot.js'].forEach(load);

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

// ---- AI chat engine (context + patch pipeline) ----
const ctx = PO.ai.buildContext(W, 'how does combat work', {});
ok(ctx.indexOf('WORKSPACE: Test WS') >= 0, 'context names the workspace');
ok(ctx.indexOf('rule.') >= 0, 'context lists relevant node ids');
PO.ui = undefined; // ai.js must not depend on the UI layer
const sp = PO.ai.systemPrompt(W, {});
ok(sp.indexOf('po-patch') >= 0, 'system prompt documents the patch format');
ok(typeof PO.ui === 'undefined', 'ai.js loaded without a UI layer');

const goodPatch = { ops: [
  { op: 'update', id: 'rule.' + (Object.keys(W.nodes).find(id => id.startsWith('rule.')) || 'x').split('.')[1], text: 'Players must always keep every item after death, including on disconnect.' },
  { op: 'create', type: 'rule', title: 'Session timeout', text: 'Sessions must expire after 30 minutes of inactivity.' },
  { op: 'link', a: 'placeholder-a', b: 'placeholder-b', rel: 'implements' }
]};
// fix ids against the real workspace
const anyRuleId = Object.keys(W.nodes).find(id => id.startsWith('rule.'));
goodPatch.ops[0].id = anyRuleId;
const featId = Object.keys(W.nodes).find(id => id.startsWith('feature.')) || anyRuleId;
goodPatch.ops[2].a = anyRuleId; goodPatch.ops[2].b = featId;
PO.ai.setWorkspaceForValidation(W);
const vres = PO.ai.validatePatch(goodPatch);
ok(vres.ok, 'valid patch passes: ' + (vres.ok ? '' : vres.errors.join('; ')));
const badPatch = { ops: [
  { op: 'update', id: 'nope.missing', text: 'x' },
  { op: 'delete', id: 'folder.root' },
  { op: 'link', a: 'same.id', b: 'same.id', rel: 'notARel' },
  { op: 'create', type: 'bogus', title: '', text: '' }
]};
const vbad = PO.ai.validatePatch(badPatch);
ok(!vbad.ok && vbad.errors.length >= 4, 'invalid patch rejected with errors (' + vbad.errors.length + ')');
ok(PO.ai.validatePatch({ ops: [] }).ok === false, 'empty ops rejected');
const extracted = PO.ai.extractPatch('Plan here.\n```po-patch\n' + JSON.stringify(goodPatch) + '\n```');
ok(extracted && extracted.ops.length === 3, 'patch extracted from fenced block');
ok(PO.ai.extractPatch('no patch here') === null, 'missing patch returns null');

const nodesBefore = Object.keys(W.nodes).length;
const versionsBefore = W.versions.length;
const applied = PO.ai.applyPatch(goodPatch, 'test');
ok(applied.applied.length === 3, 'all three ops applied');
ok(applied.skipped.length === 0, 'no ops skipped');
ok(Object.keys(W.nodes).length === nodesBefore + 1, 'create added exactly one node');
ok(W.versions.length === versionsBefore + 2, 'update+create each added a version entry');
ok(W.changelog.some(c => c.action === 'ai-edit'), 'changelog recorded ai-edit');
ok(W.changelog.some(c => c.action === 'ai-add'), 'changelog recorded ai-add');
const createdId = applied.applied.find(a => a.op === 'create').id;
ok(W.nodes[createdId] && W.nodes[createdId].parent === 'folder.rules', 'created rule landed in folder.rules: ' + createdId);
ok(W.edges.some(e => e.a === createdId && e.rel === 'partof'), 'created node got a partof edge');
ok(W.nodes[anyRuleId].text.indexOf('including on disconnect') >= 0, 'update applied verbatim');
ok(W.nodes[anyRuleId].ver >= 2, 'update bumped node version (now v' + W.nodes[anyRuleId].ver + ')');
// duplicate link is skipped
const dupApply = PO.ai.applyPatch(goodPatch, 'test2');
ok(dupApply.skipped.some(s => s.why === 'link already exists'), 'duplicate link skipped on re-apply');
ok(PO.ai.summarizeChanges(applied).length > 0, 'changes summarized: ' + PO.ai.summarizeChanges(applied));
PO.ai.setWorkspaceForValidation(null);

// ---- provider catalog, quotas & usage tracker ----
const P = PO.ai.presets();
ok(Object.keys(P).length >= 8, 'provider catalog has ' + Object.keys(P).length + ' providers');
ok(PO.ai.isLocal('ollama') && PO.ai.isLocal('lmstudio'), 'local providers flagged');
ok(!PO.ai.isLocal('groq'), 'cloud provider not local');
ok(PO.ai.contextLimit({ model: 'llama-3.3-70b-versatile' }) === 128000, 'free-model ctx limit known');
ok(PO.ai.contextLimit({ model: 'gemini-2.0-flash' }) === 1000000, 'gemini 1M ctx limit');
ok(PO.ai.contextLimit({ model: 'totally-unknown-model' }) === 128000, 'fallback ctx limit');
ok(!!PO.ai.modelInfo('llama-3.1-8b-instant'), 'model info present');
ok(PO.ai.modelInfo('llama-3.1-8b-instant').ctx >= 8000, 'context window present: ' + PO.ai.modelInfo('llama-3.1-8b-instant').ctx);
PO.ai.recordUsage({ provider: 'groq', model: 'llama-3.3-70b-versatile', inTok: 100, outTok: 50, ms: 1200 });
PO.ai.recordUsage({ provider: 'groq', model: 'llama-3.3-70b-versatile', inTok: 200, outTok: 80, ms: 900 });
const us = PO.ai.usageSummary();
ok(us.todayMsgs === 2, 'usage tracker counts messages');
ok(us.todayTok === 430, 'usage tracker sums tokens (' + us.todayTok + ')');
ok(us.today.byModel['llama-3.3-70b-versatile'].msgs === 2, 'usage tracked per model');

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
