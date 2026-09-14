export type Tier = string

/** One way to qualify. A mint can list several; any one of them is enough. */
export type Rule =
  | { via: 'spots'; list: string; tier: Tier }
  | { via: 'holds'; collection: string; min?: number; tier: Tier }

export interface Phase {
  tier: Tier
  /** ISO, or null when the project has not announced this window yet. */
  opensAt: string | null
  closesAt?: string | null
  /** As the project wrote it. null means free, undefined means unknown. */
  price?: string | null
  limit?: number | null
}

export interface MintEntry {
  code: string
  name: string
  eligibility: Rule[]
  startsAt: string | null
  phases?: Phase[]
  note?: string
  url?: string
  /** When the box filling these spot lists closes, if it has not yet. */
  spotsDrawAt?: string | null
}

export interface SpotList {
  source: string
  /** How many spots were awarded, when that is more than we hold addresses for. */
  expected?: number
  wallets: string[]
  /** Winners who must still do something or the spot lapses. */
  needs?: { message: string; wallets: string[] }
  /** EVM address -> where the thing actually goes, for non-EVM mints. */
  delivery?: Record<string, string>
}

export type Bucket = 'live' | 'hour' | 'today' | 'tomorrow' | 'week' | 'later' | 'tbd' | 'done'

export interface BoardRow {
  code: string
  name: string
  tier: Tier
  reasons: string[]
  actions: string[]
  deliverTo: string | null
  when: string | null
  until: string | null
  state: 'live' | 'soon' | 'tbd' | 'closed'
  bucket: Bucket
  phases: (Phase & { yours: boolean })[]
  note?: string
  url?: string
}

export interface HeldAsset { collection: string; name: string; count: number }

export interface RaffleTier {
  label: string
  /** null when uncapped — a blanket allowlist rather than a draw. */
  count: number | null
  who: string
  drawn: boolean
}

export interface RaffleEntry {
  id: string
  project: string
  closesAt: string
  tiers: RaffleTier[]
  /** Straight to the announcement, so entering is one tap and not a hunt. */
  enterUrl?: string
  homework?: string
  note?: string
}
