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
  /**
   * When this mint's window actually shut.
   *
   * Without it a mint stays "live" for a grace period after its start, which
   * is right for the common case — projects run late, and dropping the row on
   * the minute takes the details away from somebody mid-mint. But the grace is
   * a guess, and an operator who KNOWS it is over should be able to say so
   * rather than wait for a timer to agree.
   */
  endedAt?: string | null
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

/**
 * A community whose holders can enter something.
 *
 * The board already knows which WALLETS qualify. This is the other half a
 * person needs before they paste anything: *which room do I have to be in*.
 * Somebody who holds nothing yet should be able to read an opportunity, see
 * whose community it is for, and go and find that community — so the links
 * are part of the answer rather than decoration.
 *
 * Every link is optional and a missing one renders nothing. A community with
 * no Discord is common; a fabricated invite is not recoverable.
 */
export interface Community {
  id: string
  name: string
  /** One or two emoji. Shown on the picker button — no image hosting needed. */
  icon?: string
  /** X handle, no @. */
  x?: string
  /** Full invite URL. */
  discord?: string
  /** Full collection URL. */
  opensea?: string
  /** Optional one-liner: who they are, in their own words. */
  blurb?: string
}

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
  /**
   * A draw shuts and picks names; a claim just stays open until it fills.
   * They need different words on the card, because telling somebody to "enter"
   * a thing they can simply take costs them the spot.
   */
  kind?: 'raffle' | 'claim'
  /**
   * null for an opportunity with no deadline. A claim that runs until supply
   * runs out has no honest countdown, and inventing one expires a live door.
   */
  closesAt: string | null
  tiers: RaffleTier[]
  /** Straight to the announcement, so entering is one tap and not a hunt. */
  enterUrl?: string
  /** A claim's door is on the project's own site, not in our announcement. */
  url?: string
  /**
   * Community ids whose holders can enter. Hold any ONE of them and you
   * qualify — they are alternatives, not requirements, which is why an empty
   * list means open to everyone rather than open to nobody.
   */
  communities?: string[]
  homework?: string
  note?: string
}

/**
 * A collection offering allocation to communities.
 *
 * The other side of the board. A community runs a board for its holders; a
 * project with a mint coming needs those communities and usually finds them by
 * DMing one founder at a time. This is that, written down once: what you are,
 * when you mint, and how many spots you can give.
 *
 * `status` is the whole safety model. Anybody can submit; nothing is public
 * until an operator approves it, because an open form that publishes straight
 * to a directory is a spam surface with a project's name on it.
 */
export interface Partner {
  id: string
  name: string
  /** X handle without the @. */
  handle: string
  chain: string
  supply: number | null
  /** ISO, or null when the project has not announced one. */
  mintAt: string | null
  /** What they are offering, in their own words: "50 GTD, 100 FCFS". */
  offer: string
  /** What a community's holders must do to claim it. */
  requirements?: string
  url?: string
  /** How a community reaches them. Shown only once approved. */
  contact?: string
  note?: string
  status: 'pending' | 'approved' | 'declined'
  submittedAt: string
}

/**
 * How a collection's minters behaved afterwards.
 *
 * Three questions about the same cohort — the wallets that minted — asked at a
 * fixed window after each token was minted:
 *
 *   held        still holds what it minted
 *   flipped     sold within the window
 *   accumulated ended up holding MORE than it minted
 *
 * They are shares of the minter cohort, not of supply, so a whale minting 50
 * counts once. Counting by token would let one wallet's behaviour stand in for
 * a community's.
 */
export interface HolderStats {
  /** Matches a partner's `handle`, lowercased, so a card can find its stats. */
  handle: string
  collection: string
  /**
   * How well a community held the allocation YOU gave them.
   *
   * This is not about the partner's own collection — how their own minters
   * behaved says nothing about what happens when you hand their room spots.
   * The cohort is the wallets on that partner's allocation list, and the
   * token measured is yours.
   */
  /** Wallets from this community's allocation that actually minted. */
  minted: number
  /** Of those, how many still hold one they minted. The retention question. */
  held: number
  /**
   * Wallets now holding MORE than they were handed — they went and bought.
   *
   * Not a slice of held/sold and deliberately not added to them: a wallet can
   * sell the one it minted and still buy three on secondary, so this overlaps
   * both. It is its own measure and the card shows it as one.
   */
  boughtMore: number
  /**
   * Tokens sitting in this community's wallets now, secondary buys included.
   * Read it against `boughtMore`: a big number from a couple of wallets is one
   * collector, not a room that believes.
   */
  keysNow: number
  /** ISO. Stats age badly and a card should be able to say how old they are. */
  scannedAt: string
  /** The block the ownership replay ran to, so a rerun can be compared. */
  atBlock: number
  /**
   * Which way round the allocation went.
   *
   * Unset (the default) means somebody else's community was given OUR spots.
   * `true` means the reverse: our room was given somebody else's, and this is
   * what we did with it. Both answer the same question — of the wallets given
   * an allocation, how many still hold what they minted — so they rank in one
   * table. The flag exists to label them, not to score them differently.
   */
  outbound?: boolean
  /**
   * How many separate allocations an outbound row covers.
   *
   * Present only when a row is several mints combined. It forces the card to
   * say "spots taken" instead of "wallets", because a wallet that took all
   * three is counted three times in the total — the ratio is right, the noun
   * is not, and "288 wallets" would be more people than the cohort has.
   */
  across?: number
}


/**
 * How OUR room behaved with a spot somebody gave US.
 *
 * The mirror of HolderStats, and deliberately a separate type. HolderStats
 * asks how a partner's community held the allocation we handed them; this
 * asks how we held theirs. Same shape of question, opposite direction, and
 * collapsing them into one table would make both unreadable.
 *
 * This is the number a partner publishes about us. Toadstools said out loud
 * they kept every wallet from every community that minted and would post
 * which room had diamond hands and which was the jeet — so it is worth
 * knowing our own answer before somebody else prints theirs.
 */
export interface SpotOutcome {
  /** The mint code on the board, e.g. TOAD. */
  code: string
  name: string
  /** Spots we were given. */
  spots: number
  /** Wallets we could actually read. spots - checked is our blind spot. */
  checked: number
  /** Claimed the mint. */
  minted: number
  /** Of those, still holding. */
  held: number
  /** Minted and no longer holding. Proven, not inferred from an empty wallet. */
  sold: number
  /** Had a spot and never claimed it. Not the same as selling and never will be. */
  neverMinted: number
  /** Wallets the indexer would not answer for. Never folded into any of the above. */
  unreadable: number
  chain: 'bitcoin' | string
  scannedAt: string
  /** How it was measured, so a number can always be argued with. */
  method: string
}
