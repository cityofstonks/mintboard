import stats from '@/data/holder-stats.json'
import type { HolderStats } from './types'

const ALL = stats as HolderStats[]

export const statsFor = (handle: string): HolderStats | null =>
  ALL.find(s => s.handle.toLowerCase() === handle.trim().toLowerCase()) ?? null

export const allStats = (): HolderStats[] => ALL

// The arithmetic lives in stats.ts so it can be tested without this file's
// data import. Re-exported here so callers keep one import.
export { shares, byRetention } from './stats'
