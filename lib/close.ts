/**
 * Closing a raffle: drawing it, recording it, and saying so.
 *
 * Three things have to be true at once, and each of them has bitten us before:
 *
 *  - It runs EXACTLY once per pass. A cron that fires every few minutes will
 *    happily draw the same raffle twice and hand out forty spots, so a pass is
 *    claimed with an insert against a primary key before anything is drawn.
 *    Losing that race is the normal case, not an error.
 *  - Tickets are recomputed from the published formula, not from whatever was
 *    displayed on the post. The post is a view; the ledger is the record.
 *  - An announcement that is too long is SPLIT, never thrown. A throw here
 *    once killed two second passes and then reported them as "nobody entered".
 */
import { weigh, draw, type Entrant, type Weighted, type Params } from './tickets.ts'

export interface Tier {
  label: string
  count: number | null
  who?: string
  /**
   * Minimum holding to be eligible for THIS tier.
   *
   * A box can now say "3 guaranteed, Key Masters only, then 5 open to every
   * holder". Without it the draw took every entrant for every tier and a tier
   * promising Key Masters would quietly hand spots to anyone — the post would
   * be a lie the winners list proves.
   *
   * Uses held_at_entry, which is already recorded per entry, so eligibility is
   * judged at the moment somebody entered rather than re-read at draw time.
   * Somebody who qualified when they pressed the button keeps their place.
   */
  minHeld?: number
}

/** Everything a pass decided, so it can be checked afterwards by anyone. */
export interface Result {
  seed: string
  tiers: { label: string; winners: string[] }[]
  pool: Weighted[]
  short: number       // spots that had no one left to give them to
}

/**
 * The seed is published so the draw can be rerun by hand.
 *
 * It is derived from facts that were fixed BEFORE the draw — the raffle's own
 * id and its closing time — so nobody, us included, can shop for a seed that
 * produces a nicer answer.
 */
export const seedFor = (raffleId: string, closesAt: string, pass: number) =>
  `${raffleId}:${closesAt}:${pass}`

export function drawTiers(entrants: Entrant[], tiers: Tier[], p: Params, seed: string): Result {
  const pool = weigh(entrants, p)
  const taken = new Set<string>()
  const out: Result['tiers'] = []
  let short = 0

  for (const t of tiers) {
    const eligible = t.minHeld
      ? new Set(entrants.filter(e => (e.held ?? 0) >= t.minHeld!).map(e => e.id))
      : null
    const left = pool.filter(w => !taken.has(w.id) && (!eligible || eligible.has(w.id)))
    // A null count means "everyone left qualifies" — an FCFS list rather than
    // a fixed number of seats.
    const want = t.count === null ? left.length : t.count
    const winners = draw(left, Math.min(want, left.length), `${seed}:${t.label}`)
    winners.forEach(w => taken.add(w))
    if (want > winners.length) short += want - winners.length
    out.push({ label: t.label, winners })
  }
  return { seed, tiers: out, pool, short }
}

/**
 * Discord takes 2,000 characters. Longer announcements are split on line
 * boundaries so a long winners list reads as several posts rather than
 * failing — and failing here is worse than it sounds, because the failure
 * surfaces upstream as "drew nobody".
 */
export function splitMessage(text: string, limit = 1900): string[] {
  const parts: string[] = []
  let cur = ''
  for (const line of text.split('\n')) {
    // One line longer than the whole limit cannot be split on a boundary, so
    // it is hard-cut rather than dropped.
    if (line.length > limit) {
      if (cur) { parts.push(cur); cur = '' }
      for (let i = 0; i < line.length; i += limit) parts.push(line.slice(i, i + limit))
      continue
    }
    if (cur.length + line.length + 1 > limit) { parts.push(cur); cur = line }
    else cur = cur ? `${cur}\n${line}` : line
  }
  if (cur) parts.push(cur)
  return parts.length ? parts : ['']
}

/**
 * Winners, laid out so the list can always be split on a line boundary.
 *
 * One long line of mentions would eventually hit splitMessage's hard cut,
 * which slices mid-character — and half a `<@id>` is not a tag, it is a
 * winner who never gets pinged. Wrapping keeps every mention whole.
 */
function mentionBlock(ids: string[], perLine = 12): string {
  const rows: string[] = []
  for (let i = 0; i < ids.length; i += perLine) {
    rows.push(ids.slice(i, i + perLine).map(id => `<@${id}>`).join(' '))
  }
  return rows.join('\n')
}

/** The announcement. Tags every winner, because an untagged winner never sees it. */
export function announcement(project: string, r: Result, tiers: Tier[], boardUrl: string): string {
  const lines = [`**${project.toUpperCase()} — DRAWN.**`, '']
  for (const t of r.tiers) {
    const spec = tiers.find(x => x.label === t.label)
    lines.push(`**${t.winners.length} ${t.label.toUpperCase()}**${spec?.who ? ` · ${spec.who}` : ''}`)
    lines.push(t.winners.length ? mentionBlock(t.winners) : '_nobody entered for this one_')
    lines.push('')
  }
  if (r.short > 0) {
    lines.push(`${r.short} spot${r.short === 1 ? '' : 's'} went unclaimed — fewer entries than seats.`, '')
  }
  lines.push(
    `**Winners: check <${boardUrl}> to confirm the wallet we have on file for you.**`,
    'If it is wrong, fix it there before the mint — we send to what is recorded, not to what you meant.',
    '',
    `Drawn from the ledger with published seed \`${r.seed}\`. ${r.pool.length} entrants, `
    + `${r.pool.reduce((a, w) => a + w.tickets, 0)} tickets`
    + (r.pool.some(w => w.capped) ? `, ${r.pool.filter(w => w.capped).length} capped at 10% of the pool.` : '.'),
  )
  return lines.join('\n')
}
