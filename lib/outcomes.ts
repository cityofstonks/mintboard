import type { SpotOutcome } from './types'

/**
 * The arithmetic, kept free of the data import.
 *
 * Same split as stats.ts / holderStats.ts: a file that imports a JSON dataset
 * cannot be unit-tested under plain `node --test`, because the `@/` alias only
 * exists inside the bundler. So the sums live here and the loader re-exports.
 */

/**
 * Retention as a percentage, or null when there is nothing to divide by.
 *
 * Null rather than 0: a mint nobody claimed has no hold rate, and printing
 * "0%" beside it reads as "everybody sold" — the opposite of the truth.
 */
export const holdRate = (o: SpotOutcome): number | null =>
  o.minted > 0 ? Math.round((o.held / o.minted) * 100) : null

/** Of the spots we were given, how many were actually used. */
export const claimRate = (o: SpotOutcome): number | null =>
  o.spots > 0 ? Math.round((o.minted / o.spots) * 100) : null

/**
 * One line a partner can check in seconds.
 *
 * Leads with the hold rate because that is what gets published about us, and
 * names the blind spot out loud when there is one — a number with an
 * unstated gap in it is how a stat becomes a liability.
 */
export function headline(o: SpotOutcome): string {
  const h = holdRate(o)
  if (o.minted === 0) return `${o.spots} spots, none claimed`
  const gap = o.unreadable ? `, ${o.unreadable} unreadable` : ''
  return `${o.spots} spots · ${o.minted} minted · ${o.held} still holding · ${o.sold} sold` +
    (h === null ? '' : ` · ${h}% hold rate`) + gap
}

/** Worst retention first; a mint nobody claimed sorts last, not best. */
export const byRetention = (a: SpotOutcome, b: SpotOutcome): number =>
  (holdRate(a) ?? 101) - (holdRate(b) ?? 101)
