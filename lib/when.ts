import type { Bucket, BoardRow } from './types'

/**
 * When a mint is, and whether it is still open.
 *
 * Split out of board.ts so it can be tested: that file imports the config and
 * the data files through the `@/` alias, which only Next resolves. These two
 * rules decide whether a holder is shown a mint at all, so being untestable
 * because of a path alias was the wrong trade.
 */

const HOUR = 3600_000, DAY = 24 * HOUR
/**
 * How long a phase with no published close stays live. Most projects announce
 * a start and never a finish; calling such a phase closed the instant it opens
 * is obviously wrong, and calling it live forever parks a dead mint at the top
 * of the board for weeks.
 */
const GRACE = DAY

export function stateOf(opensAt: string | null, now = Date.now(), closesAt?: string | null): BoardRow['state'] {
  if (!opensAt) return 'tbd'
  const open = Date.parse(opensAt)
  if (!Number.isFinite(open)) return 'tbd'
  if (open > now) return 'soon'
  const close = closesAt ? Date.parse(closesAt) : open + GRACE
  return Number.isFinite(close) && close > now ? 'live' : 'closed'
}

/** Which rail of the calendar a row sits on. Rolling windows from now. */
export function bucketOf(opensAt: string | null, now = Date.now(), closesAt?: string | null): Bucket {
  const state = stateOf(opensAt, now, closesAt)
  if (state === 'live') return 'live'
  if (state === 'tbd') return 'tbd'
  if (state === 'closed') return 'done'
  const left = Date.parse(opensAt!) - now
  if (left < HOUR) return 'hour'
  if (left < DAY) return 'today'
  if (left < 2 * DAY) return 'tomorrow'
  if (left < 7 * DAY) return 'week'
  return 'later'
}
