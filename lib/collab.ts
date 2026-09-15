import { createHmac, randomUUID } from 'node:crypto'
import type { Partner } from './types'
import { readOffer } from './offer'

/**
 * Sending an approved collab on to the bot that runs the raffle.
 *
 * NOTHING calls this except the approve action in the admin. The public form
 * writes a `pending` row and stops; a submission is somebody's unverified
 * claim until a person has looked at it. The whole point of the dashboard is
 * that a stranger filling in a form cannot make your server ping everyone.
 *
 * Configure with:
 *   COLLAB_BOT_URL     https://cityofstonks.com/api/collab-raffle
 *   COLLAB_BOT_SECRET  the same secret as COLLAB_WEBHOOK_SECRET on the bot
 *
 * Unset means the button says so, rather than silently doing nothing.
 */
const URL_ = process.env.COLLAB_BOT_URL ?? ''
const SECRET = process.env.COLLAB_BOT_SECRET ?? ''

export const routingEnabled = () => Boolean(URL_ && SECRET)


export interface RouteResult {
  ok: boolean
  messageId?: string
  error?: string
}

/**
 * Sign and send. The signature covers `${timestamp}.${body}`, so neither the
 * body nor the clock can be rewritten on the way.
 */
export async function openRaffle(
  p: Partner,
  over: { gtd?: number; fcfs?: number; hours?: number; post?: string } = {},
): Promise<RouteResult> {
  if (!routingEnabled()) {
    return { ok: false, error: 'No COLLAB_BOT_URL / COLLAB_BOT_SECRET set, so approval cannot reach Discord yet.' }
  }
  const guess = readOffer(p.offer ?? '')
  const body = JSON.stringify({
    // Per approval, not per partner: a declined-then-approved row is a new
    // approval and should be allowed through the bot's replay guard.
    id: randomUUID(),
    project: p.name,
    handle: (p.handle ?? '').replace(/^@/, ''),
    gtd: over.gtd ?? guess.gtd,
    fcfs: over.fcfs ?? guess.fcfs,
    hours: over.hours ?? 12,
    chain: p.chain ?? '',
    supply: p.supply ? String(p.supply) : '',
    post: over.post ?? '',
    note: p.note ?? '',
  })
  const ts = Date.now()
  const signature = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')

  try {
    const r = await fetch(URL_, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-collab-signature': signature,
        'x-collab-timestamp': String(ts),
      },
      body,
      // The bot spawns a child process and posts to Discord; that is slower
      // than a normal API call and worth waiting for, but not forever.
      signal: AbortSignal.timeout(60_000),
    })
    const j = await r.json().catch(() => ({})) as { messageId?: string; error?: string }
    if (!r.ok) return { ok: false, error: j.error ?? `the bot refused it (${r.status})` }
    return { ok: true, messageId: j.messageId }
  } catch (e) {
    /*
     * A timeout is NOT a failure to open.
     *
     * The raffle may well have posted and the reply been lost, which is
     * exactly how a room ends up with two identical boxes. Say what is
     * actually known and make the operator look, rather than offering a retry
     * that could double-post.
     */
    const timedOut = e instanceof Error && e.name === 'TimeoutError'
    return {
      ok: false,
      error: timedOut
        ? 'No reply within 60s. The raffle may already have posted — check the channel before approving again.'
        : `Could not reach the bot: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
