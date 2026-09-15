# ◈ Prompt Organizer — AI-Assisted Workspace for Prompts of Any Size

Paste in a huge, messy, overlapping prompt. Get back a clear, branching, searchable
workspace — **without losing a single word**. Every paragraph keeps its exact original
wording; the organizer only decides where each piece belongs, what it connects to,
and how it should be explained.

**Zero dependencies. No build step. No account. Works fully offline** — the exported
single-file HTML snapshot runs straight from a USB stick.

> 💬 **New — AI Chat ("Ask & Apply")**: chat with an AI that knows your workspace and
> can make audited edits. Bring your own key (OpenAI by default; any OpenAI-compatible
> endpoint — OpenRouter, Groq, LM Studio, Ollama). See [AI Chat](#-ai-chat--ask--apply).

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
| **AI Chat & API-style settings** | 💬 AI Chat | Bring-your-own-key streaming chat over the workspace, reviewable `po-patch` edits with changelog + versions, OpenAI-compatible endpoints |

---

## Architecture

```
index.html          shell: top bar, tab bars, workbench, status bar, modal/toast roots
css/styles.css      full theme (dark) + pro features (45 upgrades) + branch AI editor styles
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
js/ai.js            AI chat engine: BYO-key provider settings (localStorage, no free-model table),
                    OpenAI-compatible streaming client, workspace context builder,
                    po-patch validation + applier with full audit trail
js/branch-ai.js     ✨ Core requested: tree branch AI editor — aggregated full text view,
                    prompt box, 4k/8k/16k/32k/64k token selector with explanations,
                    project summary context, detailed paragraph output, updates every
                    affected node in folder, right-click context menu
js/pro-features.js  🚀 45 pro features: command palette, focus mode, split view,
                    multi-select & bulk bar, folder colors, quick rename, fav bar,
                    recent drawer, charts, heatmap, mini-map, template gallery,
                    export/import, restore points, theme builder, lint auto-fix, etc.
js/ui-chat.js       💬 AI Chat side tab: streaming bubbles, patch review cards,
                    quick actions, provider configuration modal (no free-model refs)
js/snapshot.js      JSON/ZIP/single-file-HTML export, upload (json/zip/html),
                    merge-or-replace, minimal ZIP reader/writer (stored entries)
js/graph.js         layered SVG layout, pan/zoom, drag-to-reparent, mind map, timeline
js/ui-core.js       tab viewer, hash router, selection sync, tree, modals, toasts
js/ui-tabs-a.js     Prompts, Review, Dashboard, Search, Versions, Traceability, Recompile
js/ui-tabs-b.js     Tree (with pro toolbar: palette/focus/fav/recent + ✨ hover AI button), Graph, Node (pro tools), Source, READMEs, Scripts, Documents, Assets
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

## 💬 AI Chat — "Ask & Apply"

Open **💬 Chat** (topbar button or `Alt+9`) to talk with an AI that reads your actual
workspace. Two modes:

- **Ask** — grounded answers about your nodes: "what am I missing?", "which requirements
  have no implementation?", "explain rule.items-never-lost". Answers cite node ids.
- **Apply** — ask for a change ("add a rule that sessions expire after 30 minutes and
  link it to the login feature") and the AI replies with a plan plus a `po-patch`
  block. You review the ops in a card, then **Apply** — every change lands in the
  changelog and version ledger exactly like a human edit (update / create / link /
  delete; dependents are marked stale).

**API-style settings (⚙ AI Configuration)** — per-user, bring-your-own-key:

| Field | Notes |
|---|---|
| Provider | OpenAI, OpenRouter, Groq, Cerebras, Google Gemini, Mistral, Together, **LM Studio (local)**, **Ollama (local)** |
| API base URL | Any OpenAI-compatible `/v1` endpoint works |
| Model | Free text with per-provider suggestions + context window display |
| API key | Stored only in your browser's localStorage; sent only to your provider |
| Extra system instructions | Optional house rules for tone/format |

"Test connection" verifies the key before you save. The settings panel shows model details
(context window) and provider notes. Local providers (Ollama / LM Studio) work fully offline
with no cloud at all.

A **ctx meter** under the chat shows tokens used vs your model's context window (with a
✂ trim button), the **📊 button** shows local AI-efficiency stats (messages, tokens, avg
reply speed, per-model breakdown), and the quick-action chips above the composer adapt
to your workspace ("Explain 3 coverage gaps", "Resolve 2 conflicts"…).

**Patch format** (what the AI emits — validated client-side, max 25 ops):

```json
{ "ops": [
  { "op": "update", "id": "rule.items-never-lost", "text": "full new verbatim text" },
  { "op": "create", "type": "rule", "title": "Session timeout", "text": "Sessions must expire…" },
  { "op": "link", "a": "rule.session-timeout", "b": "feature.login", "rel": "requires" },
  { "op": "delete", "id": "idea.old-idea", "reason": "superseded" }
] }
```

---

## Keyboard

`Ctrl+1..9` main tabs (Prompts → **Issues** → **Guide**) · `Alt+1..9` side tabs (Tree →
Assets, incl. AI Chat) · `G`/`T`/`D` Guide/Tree/Dashboard · `/` search · `N` new prompt ·
`[`/`]` prev/next node · `?` help · `Esc` close dialog

## New in this build — Pro Upgrade (45 features)

**✨ AI Branch Editor — the headline:**
- Click any tree node or entire folder branch → popup shows *all* descendant text verbatim, aggregated.
- Text box for your prompt instruction (“make it more detailed in paragraphs, add examples, fix grammar…”)
- **Output Tokens selector:** 4000, 8000, 16000, 32000, 64000 — each explains size, purpose, speed/cost effect.
- Submit → AI reads branch content + project overall summary (README + stats + health) and rewrites in detailed paragraphs with good grammar.
- Apply updates every affected item inside the folder — each node gets its own version entry, fully viewable via Node view or right-click → View Full Text.
- Right-click context menu on any tree row: View Full Text (entire branch), AI Enhance, Copy, Duplicate, Favorite, Recompile, Folder Color.

**45 Pro Features — organized:**

**A: Tree & Navigation Pro (10)**
1. Command Palette (Ctrl+K) — searchable actions + node jump
2. Focus Mode (F) — hide chrome, focus only on current branch
3. Split View (S) — compare two nodes side-by-side with copy
4. Multi-Select (Ctrl+Click, Shift+Click) + bulk toolbar (tag/move/export/AI)
5. Folder Color & Icon Customization (blue/green/amber/pink/red)
6. Quick Rename (double-click or context menu) with version ledger
7. Back/Forward breadcrumb history
8. Favorite Bar — horizontal quick-access, draggable, toggleable
9. Recent Edits Timeline drawer (R) — last 30 changes with jump
10. Auto-Expand folders on drag-over

**B: Editing & AI Pro (10)**
11. Branch AI Editor with token selector & project summary context
12. Full Text Aggregated Viewer — scrollable, copy, download
13. Token Size Selector (4k/8k/16k/32k/64k) with usage guidance
14. Right-Click Context Menu for every tree item
15. Inline Tag Editor — chips with add/remove + suggestions
16. Node Duplication with deep copy & audit log
17. Bulk Tag Operations for multi-select
18. Auto-Tag Suggestions (heuristic + AI button)
19. Variable Interpolation Live Preview (`{{var}}` → pill)
20. Snippet Insertion Palette with search

**C: Search & Intelligence Pro (8)**
21. Fuzzy Search with typo tolerance
22. Saved Search Folders grouped by prefix
23. Glossary Auto-Linking — terms become dashed links with hover definition
24. Acronym Expansion on hover (from Acronyms doc)
25. Search Inside Node (line-level hits)
26. Semantic Link Suggestions (similarity >35%)
27. Coverage Heatmap — topics colored by % covered
28. Negative Space Auto-Fix proposals with one-click idea creation

**D: Visualization & Analytics Pro (7)**
29. Statistics Charts (canvas, no libs) — type & status bar charts
30. Graph Mini-Map — folder structure quick nav
31. Mind Map Export as SVG
32. Timeline Filter by kind & export
33. Token Budget Live Calculator with % of context window
34. Health Checklist — actionable sentences + Fix buttons
35. Dependency Impact Graph — who depends on this node

**E: Collaboration & Quality Pro (10)**
36. Template Gallery with categories (Feature/Mechanic/Bug/Other) + preview
37. Export Branch as Markdown/JSON/ZIP
38. Import Markdown Folder Structure — headings become topics/features/rules
39. Snapshot Comparison — added/removed/changed diff
40. Auto-Save Restore Points (10 slots, localStorage)
41. Keyboard Shortcut Customizer UI + cheat sheet
42. Theme Builder — custom accent & background colors, persisted
43. Lint Auto-Fix — fixes TBD/thing/etc/extra spaces
44. Node Version Diff Inline — per-node history with line diffs
45. Workspace Executive Summary — AI-aware overview with recommendations

All features are vanilla HTML/CSS/JS, no dependencies, fully offline except AI calls.

**Previous build highlights:**
- **📖 Guide tab** — tutorial + 60-second tour (Ctrl+9).
- **⚠ Issues tab** — error console + automatic workspace checks (Ctrl+8).
- **🎨 ⚙ Preferences** — six themes, text size, spacing, animations, confetti.
- **💡 Rotating tips** — 30 suggestions, 6 at a time, auto-rotate 2 min.
- **🕸 Movable graph** — drag nodes, positions persist, auto-arrange grid.
- **🗂 Folder-organized ZIP** — scripts/documents/prompts/requirements/assets folders.
- **📊 Synced statistics** — Dashboard, Review badge, status bar share one stats pass.

## File formats

- **`.prompt-organizer.json`** — full workspace (prompts, nodes, edges, versions,
  history, tests, runs, tabs…). Re-upload to continue exactly where you left off.
- **`.prompt-organizer.zip`** — workspace + `README.md` + per-folder readmes +
  `graph.json` + `changelog.md` + `manifest.json`.
- **`.snapshot.html`** — everything above inlined into one page: viewer, search,
  graph, stats, and recompile work with no network at all.

## License

MIT — do what you like; no attribution required.
