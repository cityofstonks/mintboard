/**
 * The operational picture an operator actually needs at 2am.
 *
 * Everything here already existed — in the bot's tables, in a spot list, in
 * the output of a tool somebody ran once. The problem was never that it was
 * missing, it was that answering "did the Mixels draw fire?" meant reading
 * three JSON files and a Discord channel. A raffle closed today and nothing
 * happened for three hours because the only thing watching it was a process
 * nobody could see the state of.
 *
 * So this reports the things that go wrong, not the things that go right:
 * boxes past their close with no draw, entrants with no wallet, boost proofs
 * nobody judged, wallets verified but not yet role-synced.
 */
import { select, dbReady } from './db'
import spots from '@/data/spots.json'
import type { SpotList } from './types'

const LISTS = spots as Record<string, SpotList>

export interface Overdue {
  id: string; project: string; closesAt: string; hoursLate: number
  entries: number; drawn: boolean
}
export interface Ops {
  ready: boolean
  raffles: { id: string; project: string; status: string; closesAt: string | null; entries: number; withWallet: number; boostsFiled: number; boostsApproved: number }[]
  overdue: Overdue[]
  draws: { raffleId: string; project: string; pass: number; seed: string | null; winners: number; unclaimed: number; announced: boolean }[]
  wallets: { verified: number; people: number; ordinals: number }
  spots: { list: string; onFile: number; awarded: number; short: number }[]
}

const hoursSince = (iso: string) => (Date.now() - Date.parse(iso)) / 3.6e6

export async function ops(): Promise<Ops> {
  /*
   * Spot lists come from the repo, so they are reported even when the
   * database is unreachable. "We could not reach the database" must never
   * render as an empty operations page — that reads as "nothing is wrong".
   */
  const spotRows = Object.entries(LISTS).map(([list, l]) => {
    const onFile = (l.wallets ?? []).length
    const awarded = Math.max(l.expected ?? 0, onFile)
    return { list, onFile, awarded, short: awarded - onFile }
  }).sort((a, b) => b.short - a.short)

  if (!dbReady()) {
    return { ready: false, raffles: [], overdue: [], draws: [], wallets: { verified: 0, people: 0, ordinals: 0 }, spots: spotRows }
  }

  const [rs, es, ds, vw, ow] = await Promise.all([
    select<{ id: string; project: string; status: string; closes_at: string | null }[]>(
      'bot_raffles?select=id,project,status,closes_at&order=closes_at.desc&limit=50'),
    select<{ raffle_id: string; wallet: string | null; holder_wallet: string | null; boost_proof: string | null; boosted: boolean | null }[]>(
      'bot_entries?select=raffle_id,wallet,holder_wallet,boost_proof,boosted'),
    select<{ raffle_id: string; pass: number; seed: string | null; winners: unknown; unclaimed: number | null; message_id: string | null }[]>(
      'bot_draws?select=raffle_id,pass,seed,winners,unclaimed,message_id'),
    select<{ discord_user_id: string }[]>('verified_wallets?select=discord_user_id&unlinked_at=is.null'),
    select<{ wallet: string }[]>('ordinal_wallets?select=wallet&unlinked_at=is.null'),
  ])

  const byRaffle = (id: string) => es.filter(e => e.raffle_id === id)
  const raffles = rs.map(r => {
    const mine = byRaffle(r.id)
    return {
      id: r.id, project: r.project, status: r.status, closesAt: r.closes_at,
      entries: mine.length,
      withWallet: mine.filter(e => e.wallet || e.holder_wallet).length,
      boostsFiled: mine.filter(e => e.boost_proof).length,
      boostsApproved: mine.filter(e => e.boosted).length,
    }
  })

  /*
   * The headline. A box past its close with no draw row is the failure that
   * costs the most and announces itself the least — it looks exactly like a
   * box that is still open.
   */
  const overdue: Overdue[] = rs
    .filter(r => r.closes_at && Date.parse(r.closes_at) < Date.now())
    .filter(r => !ds.some(d => d.raffle_id === r.id))
    .map(r => ({
      id: r.id, project: r.project, closesAt: r.closes_at!,
      hoursLate: Math.round(hoursSince(r.closes_at!) * 10) / 10,
      entries: byRaffle(r.id).length,
      drawn: false,
    }))
    .sort((a, b) => b.hoursLate - a.hoursLate)

  const draws = ds.map(d => ({
    raffleId: d.raffle_id,
    project: rs.find(r => r.id === d.raffle_id)?.project ?? '(unknown raffle)',
    pass: d.pass,
    seed: d.seed,
    winners: Array.isArray(d.winners)
      ? (d.winners as { winners?: string[] }[]).reduce((a, t) => a + (t.winners?.length ?? 0), 0)
      : 0,
    unclaimed: d.unclaimed ?? 0,
    // A draw with no message never reached the room, whatever the record says.
    announced: Boolean(d.message_id),
  }))

  return {
    ready: true,
    raffles,
    overdue,
    draws,
    wallets: {
      verified: vw.length,
      people: new Set(vw.map(v => v.discord_user_id)).size,
      ordinals: ow.length,
    },
    spots: spotRows,
  }
}
