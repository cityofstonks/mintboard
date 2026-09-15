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

/**
 * The floor a community has to clear to be listed as a collab partner.
 *
 * Below this, a room is not shown on the partners page and does not surface in
 * collab matching. It can still come to us directly — this hides a listing,
 * it does not ban anybody.
 *
 * The reasoning: the whole point of publishing retention is that a project
 * with spots to give can tell which rooms hold. Listing a room that keeps
 * one token in thirteen alongside one that keeps two in three makes the page
 * worthless to the person it exists for. A directory that recommends everyone
 * recommends nobody.
 */
export const PARTNER_FLOOR = 0.20

/**
 * Below this many mints we do not judge at all.
 *
 * A brand new project with three mints and one seller reads as 33% and means
 * nothing; two mints and no sellers reads as a perfect record and means less.
 * Too small to measure is a DIFFERENT answer from measured and poor, and
 * collapsing the two would quietly blacklist every community too new to have
 * a record — the opposite of what this is for.
 */
export const MIN_SAMPLE = 10

export type Standing = 'listed' | 'below-floor' | 'too-few'

export function standing(s: HolderStats): Standing {
  if (s.minted < MIN_SAMPLE) return 'too-few'
  return s.held / s.minted >= PARTNER_FLOOR ? 'listed' : 'below-floor'
}

/** Only the rooms a project should be shown when it is choosing where spots go. */
export const listable = (rows: HolderStats[]): HolderStats[] =>
  rows.filter(r => standing(r) === 'listed')
