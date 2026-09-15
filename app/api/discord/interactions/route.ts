import { NextResponse } from 'next/server'
import {
  verifyInteraction, PING, PONG, MESSAGE_COMPONENT, MODAL_SUBMIT,
  CHANNEL_MESSAGE, MODAL, EPHEMERAL,
} from '@/lib/discordVerify'
import { ticketsFor, DEFAULTS, type Params } from '@/lib/tickets'
import { select, insert, upsert, dbReady } from '@/lib/db'
import { balanceOf } from '@/lib/chain'

export const dynamic = 'force-dynamic'

/**
 * Every button press in every server lands here.
 *
 * Discord POSTs the interaction and waits three seconds for a reply. That
 * budget is the shape of this file: verify, read one or two rows, answer. A
 * chain read can blow it, so eligibility is checked against the balance
 * recorded at entry where it can be, and re-checked properly at the draw —
 * which is the only place it has to be exactly right anyway.
 */

const reply = (content: string) =>
  NextResponse.json({ type: CHANNEL_MESSAGE, data: { content, flags: EPHEMERAL } })

interface Raffle {
  id: string; project: string; status: string; closes_at: string | null
  params: Params; chain: string | null; contract: string | null; boost_ask: string | null
}

export async function POST(req: Request) {
  // The RAW body, before any parsing. Re-serialising a parsed object changes
  // the bytes and the signature will not match what Discord signed.
  const raw = await req.text()
  const ok = verifyInteraction(
    raw,
    req.headers.get('x-signature-ed25519') ?? '',
    req.headers.get('x-signature-timestamp') ?? '',
    (process.env.DISCORD_PUBLIC_KEY ?? '').trim(),
  )
  // 401 exactly — Discord's endpoint check requires a bad signature to be
  // rejected, and will not save the URL otherwise.
  if (!ok) return new NextResponse('bad signature', { status: 401 })

  const body = JSON.parse(raw) as {
    type: number
    data?: { custom_id?: string; components?: { components?: { custom_id?: string; value?: string }[] }[] }
    member?: { user?: { id: string; username: string } }
    user?: { id: string; username: string }
  }

  if (body.type === PING) return NextResponse.json({ type: PONG })
  if (!dbReady()) return reply('This board is not finished being set up yet.')

  const user = body.member?.user ?? body.user
  if (!user?.id) return reply('Could not tell who you are.')

  // ── a wallet arriving from the modal ────────────────────────────────────
  if (body.type === MODAL_SUBMIT && body.data?.custom_id?.startsWith('wallet:')) {
    const value = body.data.components?.[0]?.components?.[0]?.value ?? ''
    const wallet = value.trim().toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(wallet)) {
      return reply('That is not a wallet address — `0x`, then 40 characters.')
    }
    await upsert('bot_wallets', { discord_user_id: user.id, wallet, set_at: new Date().toISOString() }, 'discord_user_id')
    return reply(`Saved \`${wallet.slice(0, 8)}…${wallet.slice(-6)}\`. Press **Enter** again and you are in.`)
  }

  if (body.type !== MESSAGE_COMPONENT) return reply('Not something I know how to do.')

  const [action, raffleId] = (body.data?.custom_id ?? '').split(':')
  if (!raffleId) return reply('That button has lost track of its raffle.')

  const raffle = (await select<Raffle[]>(
    `bot_raffles?id=eq.${encodeURIComponent(raffleId)}&limit=1`))?.[0]
  if (!raffle) return reply('That raffle no longer exists.')

  const p = { ...DEFAULTS, ...(raffle.params ?? {}) }
  const wallet = (await select<{ wallet: string }[]>(
    `bot_wallets?discord_user_id=eq.${user.id}&limit=1`))?.[0]?.wallet ?? null

  // ── add or change a wallet ──────────────────────────────────────────────
  if (action === 'wallet') {
    return NextResponse.json({
      type: MODAL,
      data: {
        custom_id: `wallet:${raffleId}`, title: 'Your wallet',
        components: [{
          type: 1,
          components: [{
            type: 4, custom_id: 'address', style: 1, label: 'Where a spot would be delivered',
            placeholder: '0x…', min_length: 42, max_length: 42, required: true,
            value: wallet ?? '',
          }],
        }],
      },
    })
  }

  const closed = raffle.status !== 'open'
    || (raffle.closes_at ? Date.parse(raffle.closes_at) <= Date.now() : false)

  // ── how am I doing ──────────────────────────────────────────────────────
  if (action === 'tickets') {
    const mine = (await select<{ held_at_entry: number; boosted: boolean }[]>(
      `bot_entries?raffle_id=eq.${encodeURIComponent(raffleId)}&discord_user_id=eq.${user.id}&limit=1`))?.[0]
    const count = (await select<{ discord_user_id: string }[]>(
      `bot_entries?raffle_id=eq.${encodeURIComponent(raffleId)}&select=discord_user_id`))?.length ?? 0
    if (!mine) {
      return reply(`You are **not in** ${raffle.project} yet. ${count} ${count === 1 ? 'person is' : 'people are'} in.`)
    }
    const t = ticketsFor(mine.held_at_entry, mine.boosted, p)
    return reply(
      `**${raffle.project}** — you are in with **${t} ticket${t === 1 ? '' : 's'}**`
      + ` (held ${mine.held_at_entry}${mine.boosted ? `, boosted ×${p.boost}` : ''}).`
      + `\n${count} ${count === 1 ? 'person' : 'people'} in so far.`
      + `\nNo entrant can exceed **${Math.round(p.capShare * 100)}%** of the pool, so this is a ceiling on your odds, not a promise.`)
  }

  // ── enter ───────────────────────────────────────────────────────────────
  if (action === 'enter') {
    if (closed) return reply(`**${raffle.project}** has closed. Nothing more to do.`)
    if (!wallet) {
      return reply('You need a wallet on file first — press **Add my wallet**.'
        + '\nA spot that cannot be delivered is not a spot, so this is checked now rather than chased after you have won.')
    }

    let held = 0
    if (raffle.chain && raffle.contract) {
      const n = await balanceOf(raffle.chain, raffle.contract, wallet)
      /*
       * null is UNREADABLE, never zero.
       *
       * Recording an unreadable balance as 0 would enter somebody at the base
       * ticket and they would never know their holdings had been missed. Far
       * better to refuse and let them press again.
       */
      if (n === null) {
        return reply('Could not read the chain just now, so I will not guess at your holdings. Press **Enter** again in a moment.')
      }
      held = n
    }

    try {
      await insert('bot_entries', {
        raffle_id: raffleId, discord_user_id: user.id, wallet,
        held_at_entry: held, boosted: false,
      }, 'return=minimal')
    } catch (e) {
      // The primary key does the work: a double-tap is one entry.
      if (/duplicate|already exists|23505/i.test(String(e))) {
        const t = ticketsFor(held, false, p)
        return reply(`You are already in **${raffle.project}** with **${t} ticket${t === 1 ? '' : 's'}**.`)
      }
      throw e
    }

    const t = ticketsFor(held, false, p)
    const line = raffle.boost_ask
      ? `\n\nWant more? ${raffle.boost_ask} — that is a ×${p.boost} boost, and it is optional.`
      : ''
    return reply(
      `**You are in — ${raffle.project}.**\n`
      + `**${t} ticket${t === 1 ? '' : 's'}** · holding ${held}`
      + `${held >= p.holdCap ? ` (counting stops at ${p.holdCap})` : ''}\n`
      + `Delivering to \`${wallet.slice(0, 8)}…${wallet.slice(-6)}\`.${line}`)
  }

  return reply('Not something I know how to do.')
}
