import stats from '@/data/holder-stats.json'
import type { HolderStats } from './types'

const ALL = stats as HolderStats[]

export const statsFor = (handle: string): HolderStats | null =>
  ALL.find(s => s.handle.toLowerCase() === handle.trim().toLowerCase()) ?? null

export const allStats = (): HolderStats[] => ALL

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
