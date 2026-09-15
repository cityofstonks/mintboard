import { NextResponse, after } from 'next/server'
import {
  verifyInteraction, PING, PONG, MESSAGE_COMPONENT, MODAL_SUBMIT,
  CHANNEL_MESSAGE, MODAL, EPHEMERAL,
} from '@/lib/discordVerify'
import { ticketsFor, DEFAULTS, type Params } from '@/lib/tickets'
import { select, insert, upsert, update, dbReady } from '@/lib/db'
import { balanceOf } from '@/lib/chain'

export const dynamic = 'force-dynamic'

/**
 * Every button press in every server lands here, and there are three seconds
 * to answer before Discord gives up and shows "did not respond in time".
 *
 * THAT BUDGET IS THE WHOLE ARCHITECTURE, and the first version got it wrong:
 * it looked up the raffle and the wallet before deciding what the press even
 * was, so opening a modal cost two database round trips on top of a cold
 * start. A modal CANNOT be deferred — it is the immediate reply or nothing —
 * so that path now touches nothing.
 *
 * Everything slower defers first and finishes afterwards. Discord shows a
 * thinking state, and the real answer replaces it when the chain comes back.
 */

/** Deferred, ephemeral. Discord shows "thinking" only to the presser. */
const DEFERRED = 5
/**
 * Acknowledge a button without changing anything yet.
 *
 * The reason this is used instead of DEFERRED for Enter: after a type 6, the
 * interaction's "original message" IS the raffle post, so it can be edited
 * with the interaction token alone. No bot token has to live in this
 * deployment to keep a live count on the board.
 */
const DEFERRED_UPDATE = 6

const reply = (content: string) =>
  NextResponse.json({ type: CHANNEL_MESSAGE, data: { content, flags: EPHEMERAL } })

const thinking = () => NextResponse.json({ type: DEFERRED, data: { flags: EPHEMERAL } })
const acknowledge = () => NextResponse.json({ type: DEFERRED_UPDATE })

/** Edit the message the button is attached to. */
async function editPost(appId: string, token: string, content: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  }).catch(() => { /* a stale count is not worth failing an entry over */ })
}

/** A private message to the presser, separate from the post. */
async function whisper(appId: string, token: string, content: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, flags: EPHEMERAL }),
  }).catch(() => {})
}

/**
 * The line at the bottom of the post that moves.
 *
 * Tickets rather than just a head count, because the head count alone is
 * misleading in a weighted draw: forty entrants where one holds the cap is a
 * different race from forty holding one key each.
 */
const liveLine = (people: number, tickets: number) =>
  people === 0
    ? '\n\n— **nobody in yet.** Be first.'
    : `\n\n— **${people} in · ${tickets} tickets in the pool.**`

/** Replace the thinking state with the real answer. */
async function finish(appId: string, token: string, content: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  }).catch(() => { /* the presser sees the thinking state stall; nothing else breaks */ })
}

interface Raffle {
  id: string; project: string; status: string; closes_at: string | null
  params: Params; chain: string | null; contract: string | null
  boost_ask: string | null; boost_url: string | null; post_body: string | null
}

export async function POST(req: Request) {
  // The RAW body, before parsing. Re-serialising changes the bytes and the
  // signature no longer matches what Discord signed.
  const raw = await req.text()
  const ok = verifyInteraction(
    raw,
    req.headers.get('x-signature-ed25519') ?? '',
    req.headers.get('x-signature-timestamp') ?? '',
    (process.env.DISCORD_PUBLIC_KEY ?? '').trim(),
  )
  if (!ok) return new NextResponse('bad signature', { status: 401 })

  const body = JSON.parse(raw) as {
    type: number; application_id: string; token: string
    data?: { custom_id?: string; components?: { components?: { custom_id?: string; value?: string }[] }[] }
    member?: {
      user?: { id: string; username: string }
      /** Discord sets this for anybody boosting the server. No role to configure. */
      premium_since?: string | null
    }
    user?: { id: string; username: string }
  }

  if (body.type === PING) return NextResponse.json({ type: PONG })

  const user = body.member?.user ?? body.user
  if (!user?.id) return reply('Could not tell who you are.')
  // Reported by Discord on the interaction itself — nothing to look up, and
  // nothing a community has to configure correctly.
  const isBooster = Boolean(body.member?.premium_since)
  const [action, raffleId] = (body.data?.custom_id ?? '').split(':')

  // ── the modal: answered with zero work ──────────────────────────────────
  // No database, no config read, nothing that can be slow. A modal has to be
  // the immediate response, so this branch sits above every other check —
  // including dbReady, which is a cheap env read but still one more thing
  // between the press and the window opening.
  if (body.type === MESSAGE_COMPONENT && action === 'wallet') {
    return NextResponse.json({
      type: MODAL,
      data: {
        custom_id: `wallet:${raffleId ?? 'none'}`, title: 'Your wallet',
        components: [{
          type: 1,
          components: [{
            type: 4, custom_id: 'address', style: 1,
            label: 'Where a spot would be delivered',
            placeholder: '0x…', min_length: 42, max_length: 42, required: true,
          }],
        }],
      },
    })
  }

  // Claiming the engagement boost. Also a modal, also answered with no work.
  if (body.type === MESSAGE_COMPONENT && action === 'boost') {
    return NextResponse.json({
      type: MODAL,
      data: {
        custom_id: `boost:${raffleId ?? 'none'}`, title: 'Claim the boost',
        components: [{
          type: 1,
          components: [{
            type: 4, custom_id: 'proof', style: 1,
            label: 'Link to your comment or repost',
            placeholder: 'https://x.com/you/status/…', min_length: 12, max_length: 300, required: true,
          }],
        }],
      },
    })
  }

  if (!dbReady()) return reply('This board is not finished being set up yet.')

  // ── a wallet coming back from the modal ─────────────────────────────────
  if (body.type === MODAL_SUBMIT && action === 'wallet') {
    const value = body.data?.components?.[0]?.components?.[0]?.value ?? ''
    const wallet = value.trim().toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
      return reply('That is not a wallet address — `0x`, then 40 characters.')
    }
    after(async () => {
      try {
        await upsert('bot_wallets',
          { discord_user_id: user.id, wallet, set_at: new Date().toISOString() }, 'discord_user_id')
        await finish(body.application_id, body.token,
          `Saved \`${wallet.slice(0, 8)}…${wallet.slice(-6)}\`. Press **Enter** and you are in.`)
      } catch {
        await finish(body.application_id, body.token,
          'Could not save that just now. Try again in a moment — nothing was recorded.')
      }
    })
    return thinking()
  }

  if (body.type === MODAL_SUBMIT && action === 'boost') {
    const link = (body.data?.components?.[0]?.components?.[0]?.value ?? '').trim()
    if (!/^https:\/\/(?:x|twitter)\.com\/[^\s]+\/status\/\d+/i.test(link)) {
      return reply('That needs to be a link to your own post — `https://x.com/you/status/…`.')
    }
    after(async () => {
      const say = (m: string) => finish(body.application_id, body.token, m)
      try {
        /*
         * Recorded, NOT granted.
         *
         * boosted stays false until somebody checks the link actually belongs
         * to this person and says what it should. Granting the multiplier on
         * submission would mean everybody pastes anything and the boost stops
         * meaning anything — which is worse than not offering one.
         */
        const rows = await update<unknown[]>(
          `bot_entries?raffle_id=eq.${encodeURIComponent(raffleId)}&discord_user_id=eq.${user.id}`,
          { boost_proof: link.slice(0, 300) })
        if (!rows || (Array.isArray(rows) && rows.length === 0)) {
          return say('You are not in this one yet — press **Enter** first, then claim the boost.')
        }
        await say('**Filed.** It is checked before the draw, and the boost lands then —'
          + ' your ticket count will not change until somebody has looked at it.')
      } catch {
        await say('Could not file that just now. Nothing was recorded — try again.')
      }
    })
    return thinking()
  }

  if (body.type !== MESSAGE_COMPONENT) return reply('Not something I know how to do.')
  if (!raffleId) return reply('That button has lost track of its raffle.')

  // ── everything below reads the chain or the database, so it defers ──────
  const isEnter = action === 'enter'
  after(async () => {
    // Enter acknowledged the post (type 6), so @original is the raffle
    // message and the private answer has to be a separate followup. The other
    // actions deferred an ephemeral reply, so @original IS that reply.
    const say = (m: string) => isEnter
      ? whisper(body.application_id, body.token, m)
      : finish(body.application_id, body.token, m)
    try {
      const raffle = (await select<Raffle[]>(
        `bot_raffles?id=eq.${encodeURIComponent(raffleId)}&limit=1`))?.[0]
      if (!raffle) return say('That raffle no longer exists.')

      const p = { ...DEFAULTS, ...(raffle.params ?? {}) }
      const wallet = (await select<{ wallet: string }[]>(
        `bot_wallets?discord_user_id=eq.${user.id}&limit=1`))?.[0]?.wallet ?? null

      const closed = raffle.status !== 'open'
        || (raffle.closes_at ? Date.parse(raffle.closes_at) <= Date.now() : false)

      if (action === 'tickets') {
        const mine = (await select<{ held_at_entry: number; boosted: boolean; booster: boolean }[]>(
          `bot_entries?raffle_id=eq.${encodeURIComponent(raffleId)}&discord_user_id=eq.${user.id}&limit=1`))?.[0]
        const count = (await select<{ discord_user_id: string }[]>(
          `bot_entries?raffle_id=eq.${encodeURIComponent(raffleId)}&select=discord_user_id`))?.length ?? 0
        if (!mine) {
          return say(`You are **not in** ${raffle.project} yet. ${count} ${count === 1 ? 'person is' : 'people are'} in.`)
        }
        const t = ticketsFor(mine.held_at_entry, mine.boosted, p, mine.booster)
        return say(
          `**${raffle.project}** — you are in with **${t} ticket${t === 1 ? '' : 's'}**`
          + ` (holding ${mine.held_at_entry}`
          + `${mine.boosted ? `, engagement ×${p.boost}` : ''}`
          + `${mine.booster ? `, server booster ×${p.boosterMult}` : ''}).`
          + `\n${count} ${count === 1 ? 'person' : 'people'} in so far.`
          + `\nNobody can exceed **${Math.round(p.capShare * 100)}%** of the pool — a ceiling on your odds, not a promise.`)
      }

      if (action !== 'enter') return say('Not something I know how to do.')
      if (closed) return say(`**${raffle.project}** has closed. Nothing more to do.`)
      if (!wallet) {
        return say('You need a wallet on file first — press **Add my wallet**.'
          + '\nA spot that cannot be delivered is not a spot, so this is checked now rather than chased after you have won.')
      }

      let held = 0
      if (raffle.chain && raffle.contract) {
        const n = await balanceOf(raffle.chain, raffle.contract, wallet)
        // null is UNREADABLE, never zero. Entering somebody at the base
        // ticket when they hold thirty is a loss they would never see.
        if (n === null) {
          return say('Could not read the chain just now, so I will not guess at your holdings. Press **Enter** again in a moment.')
        }
        held = n
      }

      try {
        await insert('bot_entries', {
          raffle_id: raffleId, discord_user_id: user.id, wallet,
          held_at_entry: held, boosted: false, booster: isBooster,
        }, 'return=minimal')
      } catch (e) {
        // The primary key does the work: a double-tap is one entry.
        if (/duplicate|already exists|23505/i.test(String(e))) {
          await repaint(raffle, body.application_id, body.token, p)
          const t = ticketsFor(held, false, p, isBooster)
          return say(`You are already in **${raffle.project}** with **${t} ticket${t === 1 ? '' : 's'}**.`)
        }
        throw e
      }

      await repaint(raffle, body.application_id, body.token, p)

      const t = ticketsFor(held, false, p, isBooster)
      const extra = raffle.boost_ask
        ? `\n\nWant more? ${raffle.boost_ask} — a ×${p.boost} boost. Press **Claim the boost** when you have.`
        : ''
      return say(
        `**You are in — ${raffle.project}.**\n`
        + `**${t} ticket${t === 1 ? '' : 's'}** · holding ${held}`
        + `${held >= p.holdCap ? ` (counting stops at ${p.holdCap})` : ''}`
        + `${isBooster ? ` · server booster ×${p.boosterMult}` : ''}\n`
        + `Delivering to \`${wallet.slice(0, 8)}…${wallet.slice(-6)}\`.${extra}`)
    } catch {
      await say('Something went wrong on our side. Nothing was recorded — try again.')
    }
  })

  return isEnter ? acknowledge() : thinking()
}

/**
 * Recount and repaint the post.
 *
 * Every entrant's tickets are recomputed from their recorded holdings rather
 * than summed from a stored figure, so the pool shown is the pool the draw
 * will use. A cached total that drifts from the ledger would be worse than no
 * total at all.
 */
async function repaint(raffle: Raffle, appId: string, token: string, p: Params) {
  if (!raffle.post_body) return
  try {
    const rows = await select<{ held_at_entry: number; boosted: boolean; booster: boolean }[]>(
      `bot_entries?raffle_id=eq.${encodeURIComponent(raffle.id)}&select=held_at_entry,boosted,booster`) ?? []
    const tickets = rows.reduce((a, r) => a + ticketsFor(r.held_at_entry, r.boosted, p, r.booster), 0)
    await editPost(appId, token, raffle.post_body + liveLine(rows.length, tickets))
  } catch { /* the count can be a moment stale; the entry cannot be lost */ }
}
