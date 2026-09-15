import config from '@/mintboard.config'
import { holdings } from './chain'
import mints from '@/data/mints.json'
import spots from '@/data/spots.json'
import type { Bucket, BoardRow, HeldAsset, MintEntry, SpotList, Tier } from './types'

const MINTS = mints as MintEntry[]
const SPOTS = spots as Record<string, SpotList>

const lower = (s: string) => s.trim().toLowerCase()
const listOf = (id: string): SpotList | undefined => SPOTS[id]
const onList = (id: string, addr: string) =>
  !!listOf(id)?.wallets.some(w => lower(w) === lower(addr))

// The time rules live in when.ts so they can be tested without this file's
// config and data imports. Imported for use below, re-exported so callers
// keep one import.
import { stateOf, bucketOf } from './when'
export { stateOf, bucketOf }

/** GTD-style tiers sort above FCFS-style ones; unknown tiers keep file order. */
const TIER_RANK = ['OG', 'GTD', 'GUARANTEED', 'FCFS', 'PUBLIC', 'HOLDER']
const rankTier = (t: Tier) => {
  const i = TIER_RANK.indexOf(t.toUpperCase())
  return i === -1 ? TIER_RANK.length : i
}
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export interface Board {
  rows: BoardRow[]
  holds: HeldAsset[]
  warnings: string[]
}

/**
 * The board for one wallet.
 *
 * THE RULE THE WHOLE THING RESTS ON: a row renders only if the wallet reading
 * it qualifies. Not on the list, not on the board. That is what separates this
 * from an advert for mints somebody cannot enter.
 */
export async function boardFor(address: string, now = Date.now()): Promise<Board> {
  const warnings: string[] = []
  const { held, unreachable } = await holdings(address)
  const blind = new Set(unreachable)

  const rows: BoardRow[] = []
  for (const m of MINTS) {
    const reasons: string[] = []
    const actions: string[] = []
    let deliverTo: string | null = null
    let best: Tier | null = null

    for (const rule of m.eligibility ?? []) {
      if (rule.via === 'spots') {
        const list = listOf(rule.list)
        // A list we do not hold means nobody qualifies through it. That is an
        // internal gap for the operator to fix, not news for a holder.
        if (!list) continue
        if (!onList(rule.list, address)) continue
        reasons.push('you were drawn a spot')
        const needs = list.needs
        if (needs && needs.wallets.some(w => lower(w) === lower(address))) actions.push(needs.message)
        const to = list.delivery?.[lower(address)]
        // Masked: this page takes any address typed into it and asks for no
        // signature, so printing a delivery address in full would hand anyone
        // a map from one of a person's wallets to another.
        if (to && !deliverTo) deliverTo = `${to.slice(0, 8)}…${to.slice(-6)}`
      } else {
        const min = rule.min ?? 1
        if (blind.has(rule.collection)) {
          const name = config.collections.find(c => c.id === rule.collection)?.name ?? rule.collection
          warnings.push(`Could not check your ${name} balance just now, so ${m.name} may be missing from this list. Nothing here is a "no" — reload in a moment.`)
          continue
        }
        const n = held.get(rule.collection)
        if (n === undefined || n < min) continue
        const name = config.collections.find(c => c.id === rule.collection)?.name ?? rule.collection
        reasons.push(`you hold ${plural(n, name.replace(/s$/, ''))}`)
      }
      if (best === null || rankTier(rule.tier) < rankTier(best)) best = rule.tier
    }

    if (!reasons.length || best === null) continue

    const phases = (m.phases ?? []).map(p => ({ ...p, yours: p.tier.toUpperCase() === best!.toUpperCase() }))
    const mine = phases.find(p => p.yours)
    // YOUR window, not the first one. A guaranteed holder shown the public
    // time turns up two hours late.
    const when = mine ? mine.opensAt : m.startsAt
    const until = mine?.closesAt ?? null

    rows.push({
      code: m.code, name: m.name, tier: best,
      reasons: [...new Set(reasons)], actions: [...new Set(actions)], deliverTo,
      when, until, state: stateOf(when, now, until), bucket: bucketOf(when, now, until),
      phases, note: m.note, url: m.url,
    })
  }

  const holds: HeldAsset[] = []
  for (const c of config.collections) {
    if (blind.has(c.id)) continue
    const n = held.get(c.id)
    if (n && n > 0) holds.push({ collection: c.id, name: c.name, count: n })
  }
  holds.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  const rank: Record<Bucket, number> = {
    live: 0, hour: 1, today: 2, tomorrow: 3, week: 4, later: 5, tbd: 6, done: 7,
  }
  rows.sort((a, b) =>
    // A spot you are about to lose outranks everything: it is the only row
    // that needs the reader today.
    Number(b.actions.length > 0) - Number(a.actions.length > 0)
    || rank[a.bucket] - rank[b.bucket]
    || (Date.parse(a.when ?? '') || 0) - (Date.parse(b.when ?? '') || 0)
    || rankTier(a.tier) - rankTier(b.tier)
    || a.name.localeCompare(b.name))

  return { rows, holds, warnings: [...new Set(warnings)] }
}
