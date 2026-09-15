import type { HolderStats } from './types'

/**
 * The SOLD / HOLD / GOLD arithmetic, with no data import.
 *
 * Separate from holderStats.ts purely so it can be tested: that file pulls in
 * data/holder-stats.json through the `@/` alias, which only Next resolves, and
 * a rule this consequential should not be untestable because of a path alias.
 */

/** Shares of the wallets that minted, rounded once so the pair still reads sanely. */
export function shares(s: HolderStats) {
  const n = Math.max(1, s.minted)
  return {
    held: Math.round((s.held / n) * 100),
    sold: Math.round(((s.minted - s.held) / n) * 100),
    boughtMore: Math.round((s.boughtMore / n) * 100),
  }
}

/** Sorted best-held first — the order somebody picking a partner reads in. */
export const byRetention = (rows: HolderStats[]): HolderStats[] =>
  [...rows].sort((a, b) => (b.held / Math.max(1, b.minted)) - (a.held / Math.max(1, a.minted)))
