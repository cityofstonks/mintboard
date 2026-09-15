/**
 * The thing that actually fires when a raffle closes.
 *
 * Runs on a schedule, so it must be safe to run at any moment, including
 * twice in the same second and including on a raffle it has already drawn.
 * Safety comes from one insert: a row in bot_draws keyed on (raffle, pass).
 * Whoever lands that row does the work; everybody else stops. Losing is the
 * expected outcome, not a failure to report.
 */
import { NextRequest, NextResponse } from 'next/server'
import { select, rest, update, dbReady } from '@/lib/db'
import { drawTiers, seedFor, announcement, splitMessage, type Tier } from '@/lib/close'
import { ticketsFor, DEFAULTS, type Params } from '@/lib/tickets'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TOKEN = (process.env.DISCORD_BOT_TOKEN ?? '').trim()
const BOARD = `${(process.env.SITE_URL ?? 'https://mintboard-pi.vercel.app').replace(/\/$/, '')}/theboard`

interface Row {
  id: string; project: string; guild_id: string; channel_id: string
  closes_at: string; tiers: Tier[]; params: Params | null
}
interface Entry {
  discord_user_id: string; held_at_entry: number | null
  boosted: boolean | null; booster: boolean | null
}

async function post(channelId: string, content: string): Promise<string | null> {
  const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'content-type': 'application/json',
      'User-Agent': 'Mintboard (https://mintboard-pi.vercel.app, 1.0)',
    },
    body: JSON.stringify({ content, allowed_mentions: { parse: ['users'] } }),
  }).catch(() => null)
  if (!r?.ok) return null
  return (await r.json().catch(() => null))?.id ?? null
}

/**
 * The draw itself, callable without a request.
 *
 * Exists because this plan allows exactly one cron a day, which would leave a
 * raffle sitting drawn-but-unannounced for up to 24 hours. The interactions
 * endpoint calls this too, so the first person to touch a button after a
 * close triggers it — and the daily run is only the backstop for a room that
 * went quiet.
 */
export async function sweep(): Promise<unknown[]> {
  const now = new Date().toISOString()
  const due = await select<Row[]>(
    `bot_raffles?status=eq.open&closes_at=lte.${now}`
    + `&select=id,project,guild_id,channel_id,closes_at,tiers,params&order=closes_at.asc&limit=10`)

  const done: unknown[] = []
  for (const r of due) {
    // Claim first. A unique violation means another invocation got here, and
    // that is the system working — skip quietly rather than logging alarm.
    const claim = await rest('bot_draws', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ raffle_id: r.id, pass: 1, claimed_at: now }),
    })
    if (claim.status === 409) { done.push({ id: r.id, skipped: 'already drawn' }); continue }
    if (!claim.ok) { done.push({ id: r.id, error: `claim ${claim.status}` }); continue }

    try {
      const entries = await select<Entry[]>(
        `bot_entries?raffle_id=eq.${r.id}&select=discord_user_id,held_at_entry,boosted,booster`)
      const p = r.params ?? DEFAULTS
      const result = drawTiers(
        entries.map(e => ({
          id: e.discord_user_id,
          // A holding we failed to read at entry time counts as zero HERE and
          // only here: the entrant still gets the base ticket, so an RPC
          // hiccup costs them a weighting, never their entry.
          held: e.held_at_entry ?? 0,
          boosted: Boolean(e.boosted), booster: Boolean(e.booster),
        })),
        r.tiers, p, seedFor(r.id, r.closes_at, 1))

      const parts = splitMessage(announcement(r.project, result, r.tiers, BOARD))
      let first: string | null = null
      let posted = 0
      for (const part of parts) {
        const id = await post(r.channel_id, part)
        if (id) { posted++; first ??= id }
      }

      // The record is written whatever Discord did. A winner who never saw a
      // ping must still be able to find themselves on the board.
      if (posted === 0) {
        /*
         * Nothing reached Discord — no token, an outage, a bad channel.
         *
         * Release the claim and leave the raffle open so the next sweep tries
         * again. This is only safe because the draw is a pure function of
         * inputs fixed before it ran: the retry produces the SAME winners,
         * every time. Marking it drawn here would be the old failure exactly
         * — a raffle recorded as finished that nobody was ever told about.
         */
        await rest(`bot_draws?raffle_id=eq.${r.id}&pass=eq.1`, { method: 'DELETE' })
        done.push({ id: r.id, project: r.project, error: 'could not announce', retry: 'next sweep' })
        continue
      }

      await update(`bot_draws?raffle_id=eq.${r.id}&pass=eq.1`, {
        message_id: first, seed: result.seed, unclaimed: result.short,
        winners: result.tiers, pool: result.pool,
      })
      // Partly announced still counts as drawn: the winners are recorded and
      // a missing continuation is a repost, not a redraw.
      await update(`bot_raffles?id=eq.${r.id}`, { status: 'drawn' })

      // Ticket counts go alongside the winners so the published seed can be
      // checked against real numbers rather than taken on trust.
      done.push({
        id: r.id, project: r.project, seed: result.seed,
        entrants: result.pool.length,
        tickets: entries.reduce((a, e) =>
          a + ticketsFor(e.held_at_entry ?? 0, Boolean(e.boosted), p, Boolean(e.booster)), 0),
        winners: result.tiers.map(t => ({ tier: t.label, n: t.winners.length })),
        unclaimed: result.short,
        announced: `${posted}/${parts.length}`,
      })
    } catch (err) {
      // The pass stays claimed on purpose. A half-run draw must be looked at
      // by a person, not retried by a machine into a second set of winners.
      done.push({ id: r.id, error: String(err).slice(0, 200), note: 'pass claimed, needs a look' })
    }
  }

  return done
}

export async function GET(req: NextRequest) {
  // Vercel's scheduler sends the project's CRON_SECRET. Anything else is a
  // stranger asking us to draw. They cannot draw anything EARLY — sweep only
  // touches raffles already past their close — but they could race the
  // announcement, so the door stays shut.
  const secret = process.env.CRON_SECRET ?? ''
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'no' }, { status: 401 })
  }
  if (!dbReady()) return NextResponse.json({ error: 'db not configured' }, { status: 503 })
  return NextResponse.json({ done: await sweep() })
}
