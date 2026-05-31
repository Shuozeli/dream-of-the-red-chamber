# Dream of the Red Chamber

An intelligence-analysis–style browser for *Dream of the Red Chamber* (《红楼梦》).
Browse 120 chapters, 872 canonical characters, 1,057 events, and 293 annotated
poems with cross-linked navigation between every entity. All in your browser —
no backend.

> **Live demo:** https://shuozeli.github.io/dream-of-the-red-chamber/

## What's in the box

| | Count | What it is |
|---|---|---|
| **Chapters** | 120 | Full 程乙本 text from zh.wikisource.org, parsed to Markdown |
| **Characters** | 872 | Each with canonical name + alias list + chapter coverage + role tag (主角 / 配角 / 群众 / 提及) |
| **Events** | 1,057 | Per-scene event tagged by type (议事 / 相遇 / 探病 / 争吵 / 葬礼 / 诗会 / …), with resolved participants and original-text evidence quote |
| **Poems** | 293 | 诗 / 词 / 曲 / 赋 / 对联 / 灯谜 / 酒令 / 偈 / 判词 — annotated with form, title, author (resolved to character), occasion, dedicatees, themes |

## Pages

- **总览** — dashboard (chapter-density chart, event type / poem form pies, top-12 characters)
- **人物** — filterable / searchable table of 872 characters; click → master-detail with 详情 / 参与事件 / 作诗 tabs
- **事件** — filterable table of 1,057 events; click → participants list, evidence quote, location
- **诗词** — filterable table of 293 poems; click → full verse text + author + dedicatees + themes
- **章回** — table of 120 chapters; click → 原文 / 事件 / 诗词 tabs
- **关系图** — force-directed character graph; 聚焦 + 对比 pickers for pairwise analysis (shared events between two characters)

Every chip is clickable and routes to the corresponding entity. Refresh-safe
URLs like `#/characters/6` or `#/events/89` deep-link straight to a drawer.

## Data files

The canonical knowledge graph is published as plain JSON under `data/json/`,
so you can use it in your own tools without our UI:

```
data/json/
├── stats.json          93 B
├── characters.json    211 KB     id, slug, name, aliases[], chapters_appearing[], counts
├── events.json        557 KB     id, chapter, scene_index, kind, title, summary, participant_ids[], …
├── poems.json         102 KB     id, text, form, title, author_id, dedicatee_ids[], themes[]
└── chapters.json       15 KB     id, title, word_count, event_count, poem_count
```

Chapter narrative text is in `data/parsed/chapter-NNN.md`.

The UI loads these via an in-browser DuckDB instance (DuckDB-WASM), so all SQL
queries (filters, joins, graph computation) run client-side with no server.

## Run locally

```bash
# 1) Install deps
cd ui && pnpm install

# 2) Build the in-browser DuckDB from the JSON sources + start dev server
pnpm dev
# → http://localhost:5173
```

The `predev` hook automatically rebuilds `public/hongloumeng.duckdb` from the
JSON files via `scripts/build_duckdb.py` (uses `uv` + `duckdb==1.3.2`).

For a production build:
```bash
pnpm build         # → ui/dist/, ready to deploy as a static site
```

## Deploy to GitHub Pages

The repo includes a workflow at `.github/workflows/deploy.yml` that builds
on every push to `main` and publishes the result to GitHub Pages.

In your repo Settings → Pages, set **Source** to **GitHub Actions**. That's it.

If your repo name isn't `dream-of-the-red-chamber`, set `BASE_URL` in the
workflow env to match your repo's pathname (e.g. `BASE_URL=/my-fork/`).

## Stack

- **Frontend:** React 19 · TypeScript · Vite 8 · Ant Design 6 · @antv/g6 v5 (graph) · @ant-design/charts (G2)
- **In-browser SQL:** @duckdb/duckdb-wasm 1.33
- **Build helper:** Python 3.12 + `duckdb==1.3.2` (rebuilds the .duckdb from JSON)

## License & attribution

This code is released under the [MIT License](LICENSE).

The *Dream of the Red Chamber* source text is in the public domain (程乙本, sourced from
zh.wikisource.org). The entity annotations were extracted by an LLM and have
been canonicalized; they are released under the same MIT License as the code.

If you spot an annotation error or a missing entity, please open an issue.
