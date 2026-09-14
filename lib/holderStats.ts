import stats from '@/data/holder-stats.json'
import type { HolderStats } from './types'

const ALL = stats as HolderStats[]

export const statsFor = (handle: string): HolderStats | null =>
  ALL.find(s => s.handle.toLowerCase() === handle.trim().toLowerCase()) ?? null

export const allStats = (): HolderStats[] => ALL

/** Shares of the minter cohort, rounded once so three numbers still read sanely. */
export function shares(s: HolderStats) {
  const n = Math.max(1, s.minters)
  return {
    held: Math.round((s.held / n) * 100),
    flipped: Math.round((s.flipped / n) * 100),
    accumulated: Math.round((s.accumulated / n) * 100),
  }
}
