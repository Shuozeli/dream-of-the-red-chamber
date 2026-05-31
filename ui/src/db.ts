// DuckDB-WASM bootstrap. The whole knowledge graph lives in one .duckdb
// file served as a static asset; this module downloads it once, spins up
// the WASM worker, attaches the file as a read-only database, and exposes
// a single `query` helper used by api.ts.
//
// No-backend design: GitHub Pages serves this file plus the .duckdb file
// and that's the entire stack.

import * as duckdb from '@duckdb/duckdb-wasm'

type Row = Record<string, unknown>

// ----- Init status tracking (so the UI can show a loading screen) -----

export type DbPhase =
  | 'idle'         // not started yet
  | 'wasm'         // downloading + instantiating the WASM engine
  | 'fetch'        // streaming the .duckdb file
  | 'open'         // registering + opening the DB
  | 'ready'
  | 'error'

export interface DbStatus {
  phase: DbPhase
  /** Bytes received so far (only meaningful in `fetch` phase). */
  received?: number
  /** Total bytes per Content-Length header (may be undefined). */
  total?: number
  error?: string
}

let currentStatus: DbStatus = { phase: 'idle' }
const subscribers = new Set<(s: DbStatus) => void>()

function emit(next: Partial<DbStatus>) {
  currentStatus = { ...currentStatus, ...next }
  for (const fn of subscribers) fn(currentStatus)
}

export function getDbStatus(): DbStatus {
  return currentStatus
}

export function subscribeDbStatus(fn: (s: DbStatus) => void): () => void {
  subscribers.add(fn)
  fn(currentStatus)
  return () => {
    subscribers.delete(fn)
  }
}

// ----- Init -----

let initPromise: Promise<duckdb.AsyncDuckDB> | null = null

async function init(): Promise<duckdb.AsyncDuckDB> {
  try {
    // ---- 1. WASM engine ----
    emit({ phase: 'wasm' })
    const bundles = duckdb.getJsDelivrBundles()
    const bundle = await duckdb.selectBundle(bundles)

    // Worker has to be a blob URL because the bundle worker URL is
    // cross-origin (JsDelivr CDN).
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker!}");`], {
        type: 'text/javascript',
      }),
    )
    const worker = new Worker(workerUrl)
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING)
    const db = new duckdb.AsyncDuckDB(logger, worker)
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
    URL.revokeObjectURL(workerUrl)

    // ---- 2. Stream the .duckdb file (~13 MB) with progress ----
    emit({ phase: 'fetch', received: 0, total: undefined })
    const dbUrl = import.meta.env.BASE_URL + 'hongloumeng.duckdb'
    const resp = await fetch(dbUrl)
    if (!resp.ok) {
      throw new Error(`fetch ${dbUrl}: ${resp.status} ${resp.statusText}`)
    }
    const totalHeader = resp.headers.get('content-length')
    const total = totalHeader ? Number(totalHeader) : undefined
    emit({ total })

    const reader = resp.body?.getReader()
    let buf: Uint8Array
    if (reader) {
      const chunks: Uint8Array[] = []
      let received = 0
      // We throttle the emit() rate so we don't trigger a React re-render
      // per chunk (chunks are ~16 KB; that's hundreds of renders for 13 MB).
      let lastEmit = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          chunks.push(value)
          received += value.length
          const now = performance.now()
          if (now - lastEmit > 100) {
            emit({ received })
            lastEmit = now
          }
        }
      }
      emit({ received })
      buf = new Uint8Array(received)
      let offset = 0
      for (const c of chunks) {
        buf.set(c, offset)
        offset += c.length
      }
    } else {
      // No streaming support — fall back to a single arrayBuffer().
      buf = new Uint8Array(await resp.arrayBuffer())
      emit({ received: buf.length, total: total ?? buf.length })
    }

    // ---- 3. Register + open ----
    emit({ phase: 'open' })
    await db.registerFileBuffer('hongloumeng.duckdb', buf)
    await db.open({
      path: 'hongloumeng.duckdb',
      accessMode: duckdb.DuckDBAccessMode.READ_ONLY,
    })

    emit({ phase: 'ready' })
    return db
  } catch (e) {
    emit({ phase: 'error', error: e instanceof Error ? e.message : String(e) })
    throw e
  }
}

export function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (!initPromise) initPromise = init()
  return initPromise
}

/** Run a SQL query and return rows as plain JS objects. */
export async function query<T extends Row = Row>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const db = await getDB()
  const conn = await db.connect()
  try {
    let result
    if (params && params.length > 0) {
      const stmt = await conn.prepare(sql)
      try {
        result = await stmt.query(...params)
      } finally {
        await stmt.close()
      }
    } else {
      result = await conn.query(sql)
    }
    return result.toArray().map((r) => r.toJSON()) as T[]
  } finally {
    await conn.close()
  }
}

/** Single-row convenience. Returns null when the query is empty. */
export async function queryOne<T extends Row = Row>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

