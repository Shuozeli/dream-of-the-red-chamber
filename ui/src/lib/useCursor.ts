import { useCallback, useEffect, useState } from 'react'

/**
 * AIP-158 cursor-pagination hook. The server returns an opaque
 * `next_page_token` with each response; the client only ever sends back
 * the SAME token it received. No computation of tokens. Back-navigation
 * is supported by keeping a stack of tokens we've fetched on the way
 * forward — the stack lives in client memory, never round-trips.
 *
 * Reset: when the caller changes any filter, pass it in `resetKey` and
 * the cursor resets to "first page" (empty token).
 */
export interface CursorState {
  /** Token to send to the server for the current page. '' = first page. */
  currentToken: string
  /** Token received as `next_page_token` from the last response. */
  nextToken: string
  setNextToken: (t: string) => void
  /** Go to next page. No-op if there is no next page. */
  goNext: () => void
  /** Go back one page. No-op on the first page. */
  goPrev: () => void
  /** True when goPrev would do something. */
  hasPrev: boolean
  /** True when goNext would do something. */
  hasNext: boolean
  /** 0-indexed page count (only for "Page N" display — NOT used as a token). */
  pageIndex: number
}

export function useCursor(resetKey: unknown): CursorState {
  const [currentToken, setCurrentToken] = useState('')
  const [nextToken, setNextToken] = useState('')
  const [stack, setStack] = useState<string[]>([])

  // Reset on filter change.
  useEffect(() => {
    setCurrentToken('')
    setNextToken('')
    setStack([])
  }, [resetKey])

  const goNext = useCallback(() => {
    if (!nextToken) return
    setStack((s) => [...s, currentToken])
    setCurrentToken(nextToken)
    setNextToken('')
  }, [currentToken, nextToken])

  const goPrev = useCallback(() => {
    setStack((s) => {
      if (s.length === 0) return s
      const prev = s[s.length - 1]
      setCurrentToken(prev)
      setNextToken('')
      return s.slice(0, -1)
    })
  }, [])

  return {
    currentToken,
    nextToken,
    setNextToken,
    goNext,
    goPrev,
    hasPrev: stack.length > 0,
    hasNext: !!nextToken,
    pageIndex: stack.length,
  }
}
