AI-Assisted Organizer For Any Prompts.
This is a coding prompt for building an AI-assisted organizer purposely for very large prompts but in general any should be part of this no matter prompt size. The user pastes in a huge prompt, the software sends it to an AI, and the AI reads it and documents what it finds inside the software. The system breaks the prompt into small pieces and turns it into a clear, easy-to-browse workspace. It does not summarize and it does not remove content. The original wording is kept exactly as it was, paragraph by paragraph. What the system does is find every topic, feature, mechanic, idea, rule, script, asset, document, and detail, then decide where each one belongs, what it connects to, and how it should be explained. The goal is to make a messy, long, overlapping prompt easy to understand, easy to search, easy to keep up over time, and easy to turn back into a clean prompt.

Ingestion and Chunking:
The system reads all input text and breaks it into small pieces while keeping track of where each piece came from. Each piece gets a stable name or ID, like topic.auth or feature.login. If two pieces are really the same thing, they are merged and the best version is kept, and the merge is recorded so the user can see what was combined and which version was kept. If the system is unsure where something goes, it places it in an inbox folder and marks it as uncertain. Nothing important is lost, and everything can be traced back to its original source.

Stable IDs and Merging:
Every item has a stable ID that never changes, even when the item is renamed, moved, or updated. Merges are recorded with a source link so the user can audit them. Duplicates are surfaced for review rather than silently deleted.

Branching File System:
Everything is organized into a branching file system. The top level explains the whole project: what it is about, what features it has, what it connects to, and where the main branches go. Each folder has a README explaining what is inside. Each topic, feature, mechanic, script, asset, prompt, and document has its own file or folder. Scripts go in script folders, assets in asset folders, prompts in prompt folders, and documents in document folders. Nothing is left out, and every part is placed where it makes the most sense.

Tab Viewer:
The tab viewer is the main way users move around the workspace. There are main system tabs across the top and side tabs for item-level views. The main tabs are Prompts, Review Queue, Dashboard, Search, Versions, Traceability, and Recompile. The side tabs are Tree, Graph, Node, Source, READMEs, Scripts, Documents, and Assets. Each tab shows one thing. When the user picks a node in one tab, the other tabs keep that same node selected. Filters and searches carry across tabs too. Tabs remember where you were when you switch away and come back. Tabs can be pinned so you can keep two open side by side. Tabs work with the keyboard and can be reached by link, so a saved file can open straight to the right tab with the right node selected. When the user saves the workspace, the open tabs are saved too, and they come back the same way when the file is uploaded. The tab bar stays small and readable, with room to scroll if there are too many tabs. The system reuses an existing tab instead of opening duplicates. The tab viewer should make the whole workspace feel like one place, not fifteen separate screens.

READMEs:
The root README always explains the overall project topic, what has been connected, what features are included, where things branch, and what the project is about. Every folder has its own README explaining its purpose and contents. READMEs are regenerated whenever the folder changes, with a changelog entry noting what was updated.

Relationship Map:
Alongside the folder tree, the system builds a relationship map. The folders help people browse, and the map shows how things connect. One feature may depend on a mechanic, a script may implement a feature, and a document may explain a topic. Relationship types include part of, depends on, implements, requires, references, updates, conflicts with, example of, and related to. Every item links back to the exact part of the original prompt or file it came from, so the user can always see why it was placed where it is.

Provenance Anchoring:
Every item stores a source anchor pointing back into the original text, so clicking a node highlights the sentence or paragraph it came from. Every node also carries a status: asserted by the user, inferred by the AI, merged from duplicates, or uncertain and placed in the inbox. Inferred items look visually different, can be reverted in one click, and offer a "why is this here?" view that shows the reasoning that placed them. This is what keeps the workspace trustworthy and prevents the AI from quietly inventing features the user never asked for. Every inferred item must include a verbatim quote from the source and a valid location range, or it goes to the inbox as uncertain.

Versioning, Changelog, and Diffs:
When new content is added, the system does not start over. It adds the content as a new version, finds which existing items it matches, updates those items, and updates everything connected to them. New items are created only when needed. Every change is recorded in a changelog, and a simple line-level diff shows what changed. Old information is never deleted unless the user asks. Everything is stored in a database per user, including prompts, topics, files, scripts, assets, documents, links, versions, and history, so the workspace grows over time instead of breaking apart.

Staleness and Impact Propagation:
When a topic or feature changes, every node that depends on it is marked stale with a reason. The user sees an impact preview such as "this edit affects fourteen items, three of which are referenced by the checkout feature." This turns versioning into active maintenance instead of passive storage.

Dashboard and Statistics:
The dashboard shows useful statistics: total words, characters, tokens, and reading time; number of topics, features, mechanics, scripts, documents, prompts, and assets; how deep the branches go; how many connections there are; how many items are orphaned or uncertain; how many duplicates were merged; and how many conflicts or contradictions exist. It also shows coverage by topic, average confidence, version count, recent changes, and export size. These statistics help the user understand the prompt at a glance and see where more work is needed.

Workspace Health Score:
A single number summarizes overall workspace quality, combining orphan rate, duplicate ratio, maximum branch depth, coverage percentage, stale item count, and uncertain item count. The score is broken down so the user can see exactly which factor is dragging it down, and clicking any factor opens the review queue filtered to that problem.

Viewing Sections:
The user can view the file tree, the relationship graph, node details, source traces, generated READMEs, scripts, documents, assets, prompts, versions, and search results. Node details show the ID, type, status, tags, source anchor, connections, and full text. Source traces show exactly where each item came from.

Review Queue:
Items that need human attention are collected in a review queue sorted by impact and uncertainty, so the user spends attention where it matters most. The queue includes inferred items, orphan items, uncertain items in the inbox, unresolved duplicates, detected conflicts, and stale items. Each entry can be accepted, edited, rejected, or re-parented, and every action is recorded in the changelog.

Save, Upload, and Offline Snapshot:
At any time, the user can save the entire workspace, including all topics, features, scripts, assets, documents, prompts, links, versions, and history. The save is downloadable as a ZIP or JSON file so the user can keep it on their own computer. Later, the user can upload that file back into the system to continue exactly where they left off. The system also allows saving snapshots at different points so the user can return to an earlier version. When uploading, the system merges the uploaded work with existing work or replaces it, depending on the user's choice, and all saves and uploads are tracked in the user's database so nothing is lost. The save file doubles as an offline snapshot, and a single-file HTML snapshot is also produced that works fully offline from a USB stick without the AI chat, including all files, assets, a manifest, graph data, statistics, search, and a viewer. The page itself is savable and functional on its own.

Search and Discovery:
The system supports full-text search, tag search, type filters, confidence filters, date filters, and source filters, combined with simple graph expansion so that searching for a node also surfaces its direct neighbors. It shows backlinks, forward links, breadcrumbs, outline view, table of contents, recent items, favorites, and browsing history. Saved queries are supported so the user can return to a common filter set.

Auto-Organization:
The system automatically tags items, extracts entities, detects duplicates, merges aliases, flags missing information, and generates questions for unclear areas. It detects orphan items and suggests where they should go. All auto-organization is assistive and reversible: every suggestion can be accepted, edited, or rejected, and the source of each suggestion is shown.

Prompt Engineering Tools:
The system includes prompt linting for clarity, ambiguity, tone, readability, and missing details. It shows token count and context window usage. It includes templates, a variable manager, and a snippet library so the user can reuse common patterns across prompts.

Prompt Recompiler:
This is the most valuable feature. The user can select any subtree and recompile it back into a prompt. The recompiler optionally pulls in every dependency it references, shows how the output fits a token budget, warns which hard constraints had to be dropped, separates system context from task instructions and examples, and proves through a diff that no requirement was silently lost. Without this, the system is a filing cabinet; with it, the system is an actual tool.

Testing and Evaluation:
Test Cases
Each test case has a stable ID, a name, an input prompt (or a reference to a prompt version or subtree), an expected output, and an optional scoring rule. Test cases live in a dedicated test folder and are linked to the prompt versions they exercise, so the user can see which prompts are covered and which are not.

Expected Outputs:
Expected outputs can be stored as plain text, as a list of required facts or constraints, or as a rubric with weighted criteria. The system shows the exact expected output next to the actual output so the user can compare them without leaving the workspace.

Scoring Rules:
Scoring rules are simple and transparent: exact match, contains, does not contain, length bounds, required keywords, forbidden keywords, or a manual score the user assigns after reading. Every score is stored with the prompt version, model, timestamp, and the test case it belongs to, so results can be filtered and compared later.

Prompt Version Comparison:
The user can select any two prompt versions and run them against the same test case set. The system shows the results side by side, including which test cases passed, which failed, and which changed. A summary line reports the pass count for each version so the user can see at a glance which one performed better.

Output Diffing:
For each test case, the system shows a line-level diff between the outputs of the two prompt versions. Added, removed, and changed lines are highlighted, so the user can see exactly what changed in behavior when the prompt changed. Diffs can be filtered to show only changed cases, only passing cases, or only failing cases.

Best Version Tracking:
Every test run is recorded, and the system keeps a running tally of which prompt version has the best score on the user's own test cases. The best-performing version is marked in the version history, so the user can always see which version of a prompt is currently the strongest.

Requirement Traceability:
The system extracts hard requirements, soft preferences, and explicit non-goals, then connects them to features, scripts, and documents. It reports coverage gaps such as requirements with no implementing feature, and it produces a negative-space report that points out missing but expected pieces, such as login without logout, rate limiting, lockout, or password reset. Automatic extraction is assistive: every extracted requirement is shown with its source and can be edited or removed.

Visualization:
The system shows the file tree, relationship graph, mind map, and timeline. The graph can be filtered by type, tag, confidence, or status. The graph is editable, so dragging a node to a new parent updates links automatically, and clicking a node opens its detail view.

Code and Script Support:
The system adds syntax highlighting and code folding for scripts. It shows which scripts implement which features and which features depend on which scripts, with clear links in both directions.

Asset Handling:
The system previews images, diagrams, and PDFs, and shows basic metadata and usage tracking for each asset, including which nodes reference it.

Documentation and Knowledge:
The system auto-generates READMEs, glossaries, acronym lists, indexes, changelogs, and source maps. It includes a simple natural-language Q&A mode that answers questions about the workspace by pointing to the relevant nodes and their source anchors.

Success Criteria:
The system is successful when a huge prompt turns into a clear, branching workspace; every item is placed or marked for review; links work; statistics appear; scripts, documents, prompts, and assets can be viewed; new content updates the system without losing history; a subtree can be recompiled back into a clean prompt with a token budget and a no-loss diff; and everything can be downloaded as a working offline snapshot that opens without the AI chat.
