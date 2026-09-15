/**
 * How many tickets an entry is worth.
 *
 * Printed in full on every raffle post before anybody enters. A weighting
 * nobody can recompute is indistinguishable from a rigged one — the published
 * seed proves the draw was fair GIVEN the tickets, and says nothing about
 * whether the tickets were.
 */
export interface Params {
  /** Entering at all is worth this. Without it a one-token holder and a
   *  non-holder are the same number, which they are not. */
  base: number
  /** Tickets per token held. */
  perToken: number
  /** Counting stops here. A whale with 300 should not own the draw. */
  holdCap: number
  /** Multiplier for anybody who did the optional thing and was verified. */
  boost: number
  /** No entrant may exceed this share of the whole pool. */
  capShare: number
}

export const DEFAULTS: Params = { base: 1, perToken: 1, holdCap: 10, boost: 1.5, capShare: 0.10 }

/** One entrant's raw tickets, before the pool-wide cap. */
export function ticketsFor(held: number, boosted: boolean, p: Params): number {
  /*
   * A non-finite holding is not zero holdings.
   *
   * Math.max(0, NaN) is NaN, so an unreadable balance flowed straight through
   * to NaN tickets — and one NaN in the pool makes the total NaN, which makes
   * every ceiling NaN and the draw picks nobody. The caller must never pass
   * one; this is the floor under that, and it collapses to the base ticket
   * rather than to an entry worth nothing.
   */
  const safe = Number.isFinite(held) ? held : 0
  const counted = Math.min(Math.max(0, Math.floor(safe)), p.holdCap)
  const raw = (p.base + p.perToken * counted) * (boosted ? p.boost : 1)
  // Whole tickets. A fractional ticket cannot be drawn and would only ever
  // introduce rounding somebody could argue with.
  return Math.max(1, Math.round(raw))
}

export interface Entrant { id: string; held: number; boosted: boolean }
export interface Weighted { id: string; tickets: number; capped: boolean }

/**
 * The whole pool, with the cap applied.
 *
 * The cap is computed against the CAPPED total, not the raw one, and settles
 * by iterating: trimming the biggest holder lowers the pool, which lowers the
 * ceiling, which may bring somebody else over it. Applying it once against
 * the raw total leaves entrants above their own share, which is the bug that
 * makes a published cap a lie.
 */
export function weigh(entrants: Entrant[], p: Params): Weighted[] {
  const rows: Weighted[] = entrants.map(e => ({
    id: e.id, tickets: ticketsFor(e.held, e.boosted, p), capped: false,
  }))
  if (rows.length < 2 || p.capShare <= 0 || p.capShare >= 1) return rows

  for (let pass = 0; pass < 20; pass++) {
    const total = rows.reduce((a, r) => a + r.tickets, 0)
    const ceiling = Math.max(1, Math.floor(total * p.capShare))
    const over = rows.filter(r => r.tickets > ceiling)
    if (!over.length) break
    for (const r of over) { r.tickets = ceiling; r.capped = true }
  }
  return rows
}

/**
 * Draw `count` winners, reproducibly, from a seed.
 *
 * The same seed and the same ledger always produce the same winners, so
 * anybody can recompute the result. Weighted without replacement: a winner is
 * removed before the next pick, or one entrant could win every tier.
 */
export function draw(rows: Weighted[], count: number, seed: string): string[] {
  const pool = rows.filter(r => r.tickets > 0).map(r => ({ ...r }))
  const winners: string[] = []
  let h = hash(seed)
  for (let n = 0; n < count && pool.length; n++) {
    const total = pool.reduce((a, r) => a + r.tickets, 0)
    h = next(h)
    let pick = h % total
    let i = 0
    while (i < pool.length - 1 && pick >= pool[i].tickets) { pick -= pool[i].tickets; i++ }
    winners.push(pool[i].id)
    pool.splice(i, 1)
  }
  return winners
}

/** FNV-1a over the seed, then a xorshift step per pick. Deterministic and
 *  dependency-free; the seed is published so the sequence is checkable. */
function hash(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h || 1
}
function next(h: number): number {
  h ^= h << 13; h >>>= 0
  h ^= h >>> 17
  h ^= h << 5; h >>>= 0
  return h || 1
}
