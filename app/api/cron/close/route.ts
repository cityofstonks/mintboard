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
import { judge } from '@/lib/proof'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TOKEN = (process.env.DISCORD_BOT_TOKEN ?? '').trim()
/*
 * Where a winner is sent to check their wallet.
 *
 * This pointed at the Mintboard deployment, which has no /theboard — the page
 * lives on the community's own site. The announcement would have handed every
 * winner a 404 at the exact moment they went looking for confirmation, and
 * nothing in a build or a test would have caught a URL that is only ever
 * printed into a message.
 */
const BOARD = (process.env.BOARD_URL ?? 'https://cityofstonks.com/theboard').replace(/\/$/, '')

interface Row {
  id: string; project: string; guild_id: string; channel_id: string
  closes_at: string; created_at: string; tiers: Tier[]; params: Params | null
  boost_url: string | null
}

/** The project's own X handle, so nobody boosts by linking their announcement. */
const handleOf = (url: string | null): string | undefined =>
  url?.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]+)/i)?.[1]
interface Entry {
  discord_user_id: string; held_at_entry: number | null
  boosted: boolean | null; booster: boolean | null; boost_proof: string | null
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
    + `&select=id,project,guild_id,channel_id,closes_at,created_at,tiers,params,boost_url`
    + `&order=closes_at.asc&limit=10`)

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
        `bot_entries?raffle_id=eq.${r.id}`
        + `&select=discord_user_id,held_at_entry,boosted,booster,boost_proof`)

      /*
       * Judge the outstanding proofs before drawing, not after.
       *
       * The bot tells everybody who files one that "it is checked before the
       * draw". Nothing was doing the checking — it was a person's job that had
       * never been scheduled, and on the first real raffle 21 people reached
       * four hours from close still unapproved. A promise nothing keeps is
       * worse than not making it.
       *
       * These checks read the link, not the post, so they cannot confirm the
       * right account was tagged. They can confirm nobody claimed a boost with
       * a post that predates the raffle, a duplicate, or the project's own
       * announcement — and they do it every time rather than when someone
       * remembers.
       */
      const unjudged = entries.filter(e => e.boost_proof && !e.boosted)
      let approved = 0
      if (unjudged.length) {
        const verdicts = judge(
          unjudged.map(e => ({ userId: e.discord_user_id, url: e.boost_proof! })),
          { projectHandle: handleOf(r.boost_url), openedAt: Date.parse(r.created_at), closesAt: Date.parse(r.closes_at) })
        for (const v of verdicts) {
          if (!v.ok) continue
          await update(`bot_entries?raffle_id=eq.${r.id}&discord_user_id=eq.${v.userId}`, { boosted: true })
          const hit = entries.find(e => e.discord_user_id === v.userId)
          if (hit) { hit.boosted = true; approved++ }
        }
      }
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
        boostsApproved: approved,
        boostsRefused: unjudged.length - approved,
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
