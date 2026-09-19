import outcomes from '@/data/spot-outcomes.json'
import type { SpotOutcome } from './types'

const ALL = outcomes as SpotOutcome[]

export const outcomeFor = (code: string): SpotOutcome | null =>
  ALL.find(o => o.code.toLowerCase() === code.trim().toLowerCase()) ?? null

export const allOutcomes = (): SpotOutcome[] => ALL

// Arithmetic lives in outcomes.ts so it can be tested without this data
// import. Re-exported here so callers keep one import — same shape as
// holderStats.ts does with stats.ts.
export { holdRate, claimRate, headline, byRetention } from './outcomes'
