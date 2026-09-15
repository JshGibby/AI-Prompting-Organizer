# ◈ Prompt Organizer — AI-Assisted Workspace for Prompts of Any Size

Paste in a huge, messy, overlapping prompt. Get back a clear, branching, searchable
workspace — **without losing a single word**. Every paragraph keeps its exact original
wording; the organizer only decides where each piece belongs, what it connects to,
and how it should be explained.

**Zero dependencies. No build step. No account. Works fully offline** — the exported
single-file HTML snapshot runs straight from a USB stick.

---

## ▶ Run it

```bash
# any static server (or just open index.html)
python3 -m http.server 8080
# → http://localhost:8080
```

First launch seeds a sample workspace ("Pixel Quest" spec) so every tab has something
to show. Delete it any time and import your own prompt with **＋ Prompt** (or `N`).

Headless engine tests (no browser needed):

```bash
node test-engine.js   # 30+ assertions over ingest → recompile → eval → merge
```

---

## What it does (spec coverage)

| Spec area | Where | Notes |
|---|---|---|
| **Ingestion & chunking** | ＋ Prompt | Paragraph-level chunks with char-offset source anchors; code fences kept whole |
| **Stable IDs & merging** | everywhere | `type.slug` IDs never change; merges recorded in a ledger, never silent |
| **Branching file system** | 🌳 Tree | System folders per type + user folders; drag-to-reparent |
| **Tab viewer** | top + side bars | 7 main + 8 side tabs, selection sync, carried filters, pins, deep links (`#/tab/node`), keyboard, scroll memory, saved tabs |
| **READMEs** | 📚 READMEs | Root overview + per-folder README, regenerated on change with changelog entries |
| **Relationship map** | 🕸 Graph, 🔗 Traceability | 9 relation types; folders for browsing, graph for connections |
| **Provenance anchoring** | ⌖ Source, 📄 Node | Click a node → source paragraph highlights; inferred items carry verbatim quotes or go to the inbox |
| **Versioning / changelog / diffs** | 🕘 Versions | Incremental updates, line-level diffs, per-user IndexedDB store |
| **Staleness & impact** | ✎ edit flow | Dependents marked stale with reasons; "this edit affects N items…" previews |
| **Dashboard & statistics** | 📊 Dashboard | Words/tokens/read time, counts, depth, orphans, merges, conflicts, coverage, confidence, export size |
| **Health score** | 📊 Dashboard | 0–100 from 6 factors; click any factor to open the filtered Review Queue |
| **Review queue** | 🛎 Review | Inferred / orphan / uncertain / dup / conflict / stale, sorted by severity × impact; accept · edit · revert · re-parent · merge · reject |
| **Save / upload / snapshots** | top bar | JSON, ZIP (with manifest + graph + changelogs), single-file offline HTML; merge-or-replace upload |
| **Search & discovery** | 🔎 Search | Full-text + tag/type/confidence/date/source filters, neighbor expansion, backlinks, outline, TOC, recents, favorites, history, saved queries |
| **Auto-organization** | ingest + 🕳 gaps | Tags, entities, dup detection, alias merge, missing-info flags, clarifying questions, orphan placement suggestions — all reversible |
| **Prompt engineering** | 📝 → Lint | Lint (clarity/ambiguity/tone/readability/missing), token + context-window usage, templates, `{{variables}}`, snippet library |
| **Prompt recompiler** | 🧩 Recompile | Subtree → clean prompt with dependency pull-in, token budget, forced-drop warnings, system/task/example split, no-loss diff proof |
| **Testing & evaluation** | 🕘 → Tests | Stable-ID cases, text/facts/rubric expectations, 8 transparent scoring rules, mock-model or pasted outputs, version compare with per-case diffs, best-version tracking |
| **Requirement traceability** | 🔗 Traceability | Hard/soft/non-goal extraction, implements-links, coverage gaps, negative-space report (login w/o logout, …) |
| **Visualization** | 🕸 Graph | Filterable SVG graph, mind map, timeline; drag-to-reparent, click-to-open |
| **Code & scripts** | 💻 Scripts | Highlighting + folding, implements-links both directions |
| **Assets** | 🖼 Assets | Image/PDF preview, metadata, usage tracking; small uploads embedded for portable snapshots |
| **Knowledge & Q&A** | 📚, 🔎 → Q&A | Glossary, acronyms, index, source map, NL answers with node + anchor pointers |

---

## Architecture

```
index.html          shell: top bar, tab bars, workbench, status bar, modal/toast roots
css/styles.css      full theme (dark), all components
js/util.js          text stats, similarity (shingle Jaccard + overlap), LCS diff,
                    token heuristic, CRC32, downloads
js/store.js         workspace model, IndexedDB + localStorage persistence (per-user),
                    changelog + version ledger, import normalization
js/ingest.js        chunker, classifier, stable IDs, dedup/merge, edge inference,
                    tag/entity/requirement/question extraction
js/analyze.js       stats, health, coverage, negative-space, lint, staleness/impact,
                    search, review queue, NL Q&A retrieval
js/readme.js        root/folder READMEs, glossary, acronyms, index, source map, md renderer
js/recompile.js     subtree collection, dependency pull-in, budget fit with
                    hard-constraint protection, no-loss proof
js/tests.js         test cases, scoring rules, deterministic mock model, runs,
                    run comparison, best-version tracking
js/snapshot.js      JSON/ZIP/single-file-HTML export, upload (json/zip/html),
                    merge-or-replace, minimal ZIP reader/writer (stored entries)
js/graph.js         layered SVG layout, pan/zoom, drag-to-reparent, mind map, timeline
js/ui-core.js       tab viewer, hash router, selection sync, tree, modals, toasts
js/ui-tabs-a.js     Prompts, Review, Dashboard, Search, Versions, Traceability, Recompile
js/ui-tabs-b.js     Tree, Graph, Node, Source, READMEs, Scripts, Documents, Assets
js/app.js           boot, seeding, sample data, snapshot-mode behavior
test-engine.js      headless pipeline tests (node, no browser required)
```

**Data model (per node):** stable `id`, `title`, `type`, `status`
(asserted / inferred / merged / uncertain), verbatim `text`, `source anchor`
(prompt + version + char range), `parent`, `tags`, `entities`, `confidence`,
`why` reasoning, `stale` flag + reason, `mergedFrom` audit trail.

**"AI" note:** all organization runs locally with deterministic heuristics — no API
key, no network, fully auditable. Every inference shows its reasoning, its source
quote, and a one-click revert.

---

## Keyboard

`Ctrl+1..7` main tabs · `Alt+1..8` side tabs · `/` search · `N` new prompt ·
`[`/`]` prev/next node · `?` help · `Esc` close dialog

## File formats

- **`.prompt-organizer.json`** — full workspace (prompts, nodes, edges, versions,
  history, tests, runs, tabs…). Re-upload to continue exactly where you left off.
- **`.prompt-organizer.zip`** — workspace + `README.md` + per-folder readmes +
  `graph.json` + `changelog.md` + `manifest.json`.
- **`.snapshot.html`** — everything above inlined into one page: viewer, search,
  graph, stats, and recompile work with no network at all.

## License

MIT — do what you like; no attribution required.
