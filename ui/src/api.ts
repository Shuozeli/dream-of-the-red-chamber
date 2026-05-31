// Read-only client for the local DuckDB-WASM knowledge graph. Same shape
// as the previous fetch-based API so the pages don't need to change —
// just the runtime swapped from HTTP to in-browser SQL.

import { query, queryOne } from './db'

// ============================================================
// Types (kept identical to the prior HTTP shape)
// ============================================================

export interface Stats {
  chapters: number
  characters: number
  events: number
  poems_structural: number
  poems_annotated: number
}

export interface CharacterListItem {
  id: number
  canonical_name: string
  canonical_slug: string
  primary_role: string
  first_chapter: number
  chapters_count: number
  aliases_count: number
}

/**
 * Pagination follows Google AIP-160 / AIP-158:
 * - request: `page_size` (1..1000, default 50), `page_token` (opaque)
 * - response: `items`, `next_page_token` ('' when no more), `total_size`
 *
 * The `page_token` is opaque to callers. Today it base64-encodes an
 * offset; that's an implementation detail and could change later.
 */
export interface CharacterListResponse {
  items: CharacterListItem[]
  next_page_token: string
  total_size: number
}

export interface CharacterDetail {
  id: number
  canonical_name: string
  canonical_slug: string
  primary_role: string
  first_chapter: number
  chapters_count: number
  aliases: string[]
  event_count: number
  poem_count: number
  chapters_appearing: number[]
}

export interface EventListItem {
  id: number
  chapter: number
  scene_index: number
  kind: string
  title: string
  summary: string
  participant_count: number
  participant_ids: number[]
  participant_names: string[]
  location_hint: string | null
}

export interface EventListResponse {
  items: EventListItem[]
  next_page_token: string
  total_size: number
}

export interface CharacterRef {
  id: number
  canonical_name: string
}

export interface EventDetail {
  id: number
  chapter: number
  scene_index: number
  kind: string
  title: string
  summary: string
  participants: CharacterRef[]
  unresolved_participants: string[]
  location_hint: string | null
  evidence_quote: string | null
}

export interface PoemListItem {
  id: number
  chapter: number
  scene_index: number
  form: string
  title: string | null
  author_id: number | null
  author_name: string | null
  occasion: string | null
  first_line: string
  themes: string[]
}

export interface PoemListResponse {
  items: PoemListItem[]
  next_page_token: string
  total_size: number
}

export interface PoemDetail {
  poem_id: number
  chapter: number
  scene_index: number
  text: string
  form: string
  title: string | null
  author: CharacterRef | null
  author_unresolved: string | null
  occasion: string | null
  dedicatees: CharacterRef[]
  themes: string[]
  confidence: number
}

export interface ChapterListItem {
  id: number
  title: string
  word_count: number
  event_count: number
  poem_count: number
}

export interface ChapterDetail {
  id: number
  title: string
  text: string
  events: EventListItem[]
  poems: (PoemListItem & { dedicatee_ids: number[] })[]
}

export interface GraphNode {
  id: number
  name: string
  role: string
  chapters_count: number
  weight: number
  is_focal: boolean
}

export interface GraphEdge {
  source: number
  target: number
  weight: number
}

export interface GraphResponse {
  focal: CharacterRef
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ============================================================
// Helpers
// ============================================================

// ----- AIP-160 pagination helpers (page_token <-> offset) -----

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 1000

function decodePageToken(token: string | undefined | null): number {
  if (!token) return 0
  try {
    const n = Number(atob(token))
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function encodePageToken(offset: number): string {
  return offset > 0 ? btoa(String(offset)) : ''
}

function clampPageSize(n: number | undefined): number {
  if (n == null) return DEFAULT_PAGE_SIZE
  return Math.min(Math.max(n, 1), MAX_PAGE_SIZE)
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string') return Number(v)
  return 0
}

function toStr(v: unknown): string {
  return v == null ? '' : String(v)
}

function toOpt(v: unknown): string | null {
  return v == null ? null : String(v)
}

function toIntList(v: unknown): number[] {
  if (Array.isArray(v)) return v.map(toNum)
  if (v && typeof (v as any).toArray === 'function') {
    return Array.from((v as any).toArray()).map(toNum)
  }
  return []
}

function toStrList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(toStr)
  if (v && typeof (v as any).toArray === 'function') {
    return Array.from((v as any).toArray()).map(toStr)
  }
  return []
}

function firstLineOf(text: string): string {
  return (text.split('\n')[0] ?? '').trim()
}

// ============================================================
// /api/stats
// ============================================================

async function stats(): Promise<Stats> {
  // Only canonical tables — the upstream proposed_* tables (raw LLM
  // proposals) aren't part of the public dataset.
  const rows = await query<{ table_name: string; n: bigint }>(`
    SELECT 'chapters' AS table_name, count(*)::BIGINT AS n FROM chapters UNION ALL
    SELECT 'characters', count(*)::BIGINT FROM characters UNION ALL
    SELECT 'events', count(*)::BIGINT FROM canonical_events UNION ALL
    SELECT 'poems_structural', count(*)::BIGINT FROM poems UNION ALL
    SELECT 'poems_annotated', count(*)::BIGINT FROM poem_annotations
  `)
  const m: Record<string, number> = {}
  for (const r of rows) m[r.table_name] = toNum(r.n)
  return {
    chapters: m.chapters ?? 0,
    characters: m.characters ?? 0,
    events: m.events ?? 0,
    poems_structural: m.poems_structural ?? 0,
    poems_annotated: m.poems_annotated ?? 0,
  }
}

// ============================================================
// /api/characters list
// ============================================================

async function characters(
  opts: { q?: string; sort?: string; page_size?: number; page_token?: string } = {},
): Promise<CharacterListResponse> {
  const pageSize = clampPageSize(opts.page_size)
  const offset = decodePageToken(opts.page_token)
  const order =
    opts.sort === 'name'
      ? 'canonical_name ASC'
      : opts.sort === 'first'
      ? 'first_chapter ASC, chapters_count DESC'
      : 'chapters_count DESC, canonical_name ASC'

  let where = ''
  const params: unknown[] = []
  if (opts.q) {
    where = `
      WHERE canonical_name LIKE ?
         OR EXISTS (SELECT 1 FROM unnest(aliases) u(x) WHERE u.x LIKE ?)
    `
    const pat = `%${opts.q}%`
    params.push(pat, pat)
  }

  const totalRow = await queryOne<{ n: bigint }>(
    `SELECT count(*)::BIGINT AS n FROM characters ${where}`,
    params,
  )
  const totalSize = toNum(totalRow?.n ?? 0)
  const items = await query(
    `
    SELECT id, canonical_name, canonical_slug, primary_role,
           first_chapter, chapters_count,
           len(aliases)::INTEGER AS aliases_count
    FROM characters ${where}
    ORDER BY ${order}
    LIMIT ${pageSize} OFFSET ${offset}
    `,
    params,
  )
  const mapped = items.map((r) => ({
    id: toNum(r.id),
    canonical_name: toStr(r.canonical_name),
    canonical_slug: toStr(r.canonical_slug),
    primary_role: toStr(r.primary_role),
    first_chapter: toNum(r.first_chapter),
    chapters_count: toNum(r.chapters_count),
    aliases_count: toNum(r.aliases_count),
  }))
  const nextOffset = offset + mapped.length
  return {
    items: mapped,
    next_page_token: nextOffset < totalSize ? encodePageToken(nextOffset) : '',
    total_size: totalSize,
  }
}

// ============================================================
// /api/characters/:id
// ============================================================

async function character(id: number): Promise<CharacterDetail> {
  const row = await queryOne(
    `
    SELECT id, canonical_name, canonical_slug, primary_role,
           first_chapter, chapters_count, aliases
    FROM characters WHERE id = ?
    `,
    [id],
  )
  if (!row) throw new Error(`character ${id} not found`)

  const eventCount = await queryOne<{ n: bigint }>(
    `SELECT count(*)::BIGINT AS n FROM canonical_events WHERE list_contains(participant_ids, ?)`,
    [id],
  )
  const poemCount = await queryOne<{ n: bigint }>(
    `SELECT count(*)::BIGINT AS n FROM poem_annotations WHERE author_id = ?`,
    [id],
  )
  const chaps = await query<{ chapter: number }>(
    `
    SELECT DISTINCT chapter FROM canonical_events
    WHERE list_contains(participant_ids, ?)
    ORDER BY chapter
    `,
    [id],
  )

  return {
    id: toNum(row.id),
    canonical_name: toStr(row.canonical_name),
    canonical_slug: toStr(row.canonical_slug),
    primary_role: toStr(row.primary_role),
    first_chapter: toNum(row.first_chapter),
    chapters_count: toNum(row.chapters_count),
    aliases: toStrList(row.aliases),
    event_count: toNum(eventCount?.n ?? 0),
    poem_count: toNum(poemCount?.n ?? 0),
    chapters_appearing: chaps.map((r) => toNum(r.chapter)),
  }
}

// ============================================================
// /api/events list (with filters incl. participants=A,B AND-of-list)
// ============================================================

async function events(
  opts: {
    chapter?: number
    kind?: string
    participant_id?: number
    participants?: string
    q?: string
    page_size?: number
    page_token?: string
  } = {},
): Promise<EventListResponse> {
  const pageSize = clampPageSize(opts.page_size)
  const offset = decodePageToken(opts.page_token)

  const parts: string[] = []
  const params: unknown[] = []
  if (opts.chapter != null) {
    parts.push('chapter = ?')
    params.push(opts.chapter)
  }
  if (opts.kind) {
    parts.push('type = ?')
    params.push(opts.kind)
  }
  if (opts.participant_id != null) {
    parts.push('list_contains(participant_ids, ?)')
    params.push(opts.participant_id)
  }
  if (opts.participants) {
    for (const tok of opts.participants.split(',').map((s) => s.trim()).filter(Boolean)) {
      const n = Number(tok)
      if (!Number.isNaN(n)) {
        parts.push('list_contains(participant_ids, ?)')
        params.push(n)
      }
    }
  }
  if (opts.q) {
    parts.push('(title LIKE ? OR summary LIKE ?)')
    const pat = `%${opts.q}%`
    params.push(pat, pat)
  }
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : ''

  const totalRow = await queryOne<{ n: bigint }>(
    `SELECT count(*)::BIGINT AS n FROM canonical_events ${where}`,
    params,
  )
  const totalSize = toNum(totalRow?.n ?? 0)

  // Participants resolved → names ordered by chapter coverage desc.
  const items = await query(
    `
    WITH parts AS (
      SELECT e.id AS event_id,
             list(c.id ORDER BY c.chapters_count DESC) AS pids,
             list(c.canonical_name ORDER BY c.chapters_count DESC) AS pnames
      FROM canonical_events e
      CROSS JOIN UNNEST(e.participant_ids) AS u(pid)
      JOIN characters c ON c.id = u.pid
      GROUP BY e.id
    )
    SELECT e.id, e.chapter, e.scene_index, e.type, e.title, e.summary,
           len(e.participant_ids)::BIGINT AS participant_count,
           COALESCE(p.pids, []::INTEGER[]) AS participant_ids,
           COALESCE(p.pnames, []::VARCHAR[]) AS participant_names,
           e.location_hint
    FROM canonical_events e
    LEFT JOIN parts p ON p.event_id = e.id
    ${where}
    ORDER BY e.chapter, e.scene_index
    LIMIT ${pageSize} OFFSET ${offset}
    `,
    params,
  )

  const mapped = items.map((r) => ({
    id: toNum(r.id),
    chapter: toNum(r.chapter),
    scene_index: toNum(r.scene_index),
    kind: toStr(r.type),
    title: toStr(r.title),
    summary: toStr(r.summary),
    participant_count: toNum(r.participant_count),
    participant_ids: toIntList(r.participant_ids),
    participant_names: toStrList(r.participant_names),
    location_hint: toOpt(r.location_hint),
  }))
  const nextOffset = offset + mapped.length
  return {
    items: mapped,
    next_page_token: nextOffset < totalSize ? encodePageToken(nextOffset) : '',
    total_size: totalSize,
  }
}

// ============================================================
// /api/events/:id
// ============================================================

async function event(id: number): Promise<EventDetail> {
  const row = await queryOne(
    `
    SELECT id, chapter, scene_index, type, title, summary,
           participant_ids, unresolved_participants,
           location_hint, evidence_quote
    FROM canonical_events WHERE id = ?
    `,
    [id],
  )
  if (!row) throw new Error(`event ${id} not found`)

  const pids = toIntList(row.participant_ids)
  let participants: CharacterRef[] = []
  if (pids.length > 0) {
    const placeholders = pids.map(() => '?').join(',')
    const rows = await query(
      `
      SELECT id, canonical_name FROM characters
      WHERE id IN (${placeholders})
      ORDER BY chapters_count DESC
      `,
      pids,
    )
    participants = rows.map((r) => ({
      id: toNum(r.id),
      canonical_name: toStr(r.canonical_name),
    }))
  }

  return {
    id: toNum(row.id),
    chapter: toNum(row.chapter),
    scene_index: toNum(row.scene_index),
    kind: toStr(row.type),
    title: toStr(row.title),
    summary: toStr(row.summary),
    participants,
    unresolved_participants: toStrList(row.unresolved_participants),
    location_hint: toOpt(row.location_hint),
    evidence_quote: toOpt(row.evidence_quote),
  }
}

// ============================================================
// /api/poems list
// ============================================================

async function poems(
  opts: {
    form?: string
    author_id?: number
    chapter?: number
    theme?: string
    q?: string
    page_size?: number
    page_token?: string
  } = {},
): Promise<PoemListResponse> {
  const pageSize = clampPageSize(opts.page_size)
  const offset = decodePageToken(opts.page_token)

  const parts: string[] = []
  const params: unknown[] = []
  if (opts.chapter != null) {
    parts.push('p.chapter = ?')
    params.push(opts.chapter)
  }
  if (opts.form) {
    parts.push('pa.form = ?')
    params.push(opts.form)
  }
  if (opts.author_id != null) {
    parts.push('pa.author_id = ?')
    params.push(opts.author_id)
  }
  if (opts.theme) {
    parts.push('list_contains(pa.themes, ?)')
    params.push(opts.theme)
  }
  if (opts.q) {
    parts.push('(pa.title LIKE ? OR pa.occasion LIKE ? OR p.text LIKE ?)')
    const pat = `%${opts.q}%`
    params.push(pat, pat, pat)
  }
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : ''

  const totalRow = await queryOne<{ n: bigint }>(
    `SELECT count(*)::BIGINT AS n FROM poems p JOIN poem_annotations pa ON pa.poem_id = p.id ${where}`,
    params,
  )
  const totalSize = toNum(totalRow?.n ?? 0)

  const items = await query(
    `
    SELECT p.id, p.chapter, p.scene_index, pa.form, pa.title,
           pa.author_id, c.canonical_name AS author_name,
           pa.occasion, p.text, pa.themes
    FROM poems p
    JOIN poem_annotations pa ON pa.poem_id = p.id
    LEFT JOIN characters c ON c.id = pa.author_id
    ${where}
    ORDER BY p.chapter, p.scene_index
    LIMIT ${pageSize} OFFSET ${offset}
    `,
    params,
  )

  const mapped = items.map((r) => ({
    id: toNum(r.id),
    chapter: toNum(r.chapter),
    scene_index: toNum(r.scene_index),
    form: toStr(r.form),
    title: r.title == null ? null : toStr(r.title),
    author_id: r.author_id == null ? null : toNum(r.author_id),
    author_name: r.author_name == null ? null : toStr(r.author_name),
    occasion: toOpt(r.occasion),
    first_line: firstLineOf(toStr(r.text)),
    themes: toStrList(r.themes),
  }))
  const nextOffset = offset + mapped.length
  return {
    items: mapped,
    next_page_token: nextOffset < totalSize ? encodePageToken(nextOffset) : '',
    total_size: totalSize,
  }
}

// ============================================================
// /api/poems/:id
// ============================================================

async function poem(id: number): Promise<PoemDetail> {
  const row = await queryOne(
    `
    SELECT p.id, p.chapter, p.scene_index, p.text,
           pa.form, pa.title, pa.author_id, pa.author_unresolved,
           pa.occasion, pa.dedicatee_ids, pa.themes, pa.confidence
    FROM poems p
    JOIN poem_annotations pa ON pa.poem_id = p.id
    WHERE p.id = ?
    `,
    [id],
  )
  if (!row) throw new Error(`poem ${id} not found`)

  const authorId = row.author_id == null ? null : toNum(row.author_id)
  let author: CharacterRef | null = null
  if (authorId != null) {
    const aRow = await queryOne(
      `SELECT id, canonical_name FROM characters WHERE id = ?`,
      [authorId],
    )
    if (aRow) author = { id: toNum(aRow.id), canonical_name: toStr(aRow.canonical_name) }
  }

  const dedicateeIds = toIntList(row.dedicatee_ids)
  let dedicatees: CharacterRef[] = []
  if (dedicateeIds.length > 0) {
    const placeholders = dedicateeIds.map(() => '?').join(',')
    const rows = await query(
      `SELECT id, canonical_name FROM characters WHERE id IN (${placeholders})`,
      dedicateeIds,
    )
    dedicatees = rows.map((r) => ({
      id: toNum(r.id),
      canonical_name: toStr(r.canonical_name),
    }))
  }

  return {
    poem_id: toNum(row.id),
    chapter: toNum(row.chapter),
    scene_index: toNum(row.scene_index),
    text: toStr(row.text),
    form: toStr(row.form),
    title: row.title == null ? null : toStr(row.title),
    author,
    author_unresolved: toOpt(row.author_unresolved),
    occasion: toOpt(row.occasion),
    dedicatees,
    themes: toStrList(row.themes),
    confidence: toNum(row.confidence),
  }
}

// ============================================================
// /api/chapters list
// ============================================================

async function chapters(): Promise<ChapterListItem[]> {
  const rows = await query(
    `
    SELECT c.id, c.title, c.word_count,
           (SELECT count(*)::BIGINT FROM canonical_events e WHERE e.chapter = c.id) AS event_count,
           (SELECT count(*)::BIGINT FROM poems p
            JOIN poem_annotations pa ON pa.poem_id = p.id
            WHERE p.chapter = c.id) AS poem_count
    FROM chapters c
    ORDER BY c.id
    `,
  )
  return rows.map((r) => ({
    id: toNum(r.id),
    title: toStr(r.title),
    word_count: toNum(r.word_count),
    event_count: toNum(r.event_count),
    poem_count: toNum(r.poem_count),
  }))
}

// ============================================================
// /api/chapters/:n
// Chapter text used to live in parsed/*.md, which the server side-loaded
// from disk. For the static build we ship the parsed markdown text in
// the `chapters.text` column directly via the simp-convert pre-build.
// If that column isn't there yet, fall back to fetching from /parsed/.
// ============================================================

async function chapter(n: number): Promise<ChapterDetail> {
  const row = await queryOne(
    `SELECT id, title, parsed_path FROM chapters WHERE id = ?`,
    [n],
  )
  if (!row) throw new Error(`chapter ${n} not found`)

  // Pull the .md text from the static asset directory.
  const mdUrl =
    import.meta.env.BASE_URL +
    `parsed/chapter-${String(n).padStart(3, '0')}.md`
  let text = ''
  try {
    const resp = await fetch(mdUrl)
    if (resp.ok) text = await resp.text()
  } catch {
    // ignore — page will render with empty text
  }

  const ev = await events({ chapter: n, page_size: 1000 })
  const pm = await poems({ chapter: n, page_size: 1000 })

  return {
    id: toNum(row.id),
    title: toStr(row.title),
    text,
    events: ev.items,
    poems: pm.items.map((p) => ({ ...p, dedicatee_ids: [] })),
  }
}

// ============================================================
// /api/graph/character/:id
// ============================================================

async function graph(
  id: number,
  opts: { limit?: number; interconnect?: boolean } = {},
): Promise<GraphResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100)
  const interconnect = !!opts.interconnect

  const focalRow = await queryOne(
    `SELECT canonical_name, primary_role, chapters_count FROM characters WHERE id = ?`,
    [id],
  )
  if (!focalRow) throw new Error(`character ${id} not found`)

  const neighbors = await query(
    `
    WITH focal_events AS (
      SELECT participant_ids FROM canonical_events
      WHERE list_contains(participant_ids, ?)
    ),
    neighbor_counts AS (
      SELECT u.x AS nid, count(*) AS shared
      FROM focal_events, unnest(participant_ids) u(x)
      WHERE u.x != ?
      GROUP BY u.x
    )
    SELECT c.id, c.canonical_name, c.primary_role, c.chapters_count, nc.shared
    FROM neighbor_counts nc
    JOIN characters c ON c.id = nc.nid
    ORDER BY nc.shared DESC, c.chapters_count DESC
    LIMIT ${limit}
    `,
    [id, id],
  )

  const nodes: GraphNode[] = [
    {
      id,
      name: toStr(focalRow.canonical_name),
      role: toStr(focalRow.primary_role),
      chapters_count: toNum(focalRow.chapters_count),
      weight: 0,
      is_focal: true,
    },
    ...neighbors.map((n) => ({
      id: toNum(n.id),
      name: toStr(n.canonical_name),
      role: toStr(n.primary_role),
      chapters_count: toNum(n.chapters_count),
      weight: toNum(n.shared),
      is_focal: false,
    })),
  ]

  const edges: GraphEdge[] = neighbors.map((n) => ({
    source: id,
    target: toNum(n.id),
    weight: toNum(n.shared),
  }))

  if (interconnect && neighbors.length >= 2) {
    const ids = neighbors.map((n) => toNum(n.id))
    const placeholders = ids.map(() => '?').join(',')
    // Triple-bind: needed for the IN clauses below.
    const tripled = [...ids, ...ids, ...ids]
    const inter = await query(
      `
      WITH n_events AS (
        SELECT e.participant_ids
        FROM canonical_events e
        WHERE list_has_any(e.participant_ids, [${placeholders}])
      ),
      pairs AS (
        SELECT a.x AS a_id, b.x AS b_id
        FROM n_events,
             unnest(participant_ids) a(x),
             unnest(participant_ids) b(x)
        WHERE a.x < b.x
          AND a.x IN (${placeholders})
          AND b.x IN (${placeholders})
      )
      SELECT a_id, b_id, count(*) AS shared
      FROM pairs
      GROUP BY a_id, b_id
      HAVING shared >= 2
      ORDER BY shared DESC
      `,
      tripled,
    )
    for (const r of inter) {
      edges.push({
        source: toNum(r.a_id),
        target: toNum(r.b_id),
        weight: toNum(r.shared),
      })
    }
  }

  return {
    focal: { id, canonical_name: toStr(focalRow.canonical_name) },
    nodes,
    edges,
  }
}

// ============================================================
// Exported facade — same shape as before so callers don't change
// ============================================================

export const api = {
  stats,
  characters,
  character,
  events,
  event,
  poems,
  poem,
  chapters,
  chapter,
  graph,
}
