import { NextResponse } from 'next/server'
import config from '@/mintboard.config'
import { boardFor, hasWonSomething } from '@/lib/board'
import { gateBalance, isAddress } from '@/lib/chain'
import { liveRaffles } from '@/lib/raffles'
import { callerOf, tooMany } from '@/lib/limit'

export const dynamic = 'force-dynamic'

/*
 * Per-wallet, so it must never be stored by a shared cache: two holders behind
 * one CDN node would otherwise read each other's board.
 */
const PRIVATE = { 'cache-control': 'private, no-store' }

export async function GET(req: Request) {
  // Each call fans out to one balanceOf per configured collection, so an
  // unthrottled loop here spends somebody else's RPC quota, not ours.
  if (tooMany(`board:${callerOf(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Slow down a moment and try again.' }, { status: 429 })
  }
  const address = (new URL(req.url).searchParams.get('address') ?? '').trim()
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'need a wallet address' }, { status: 400 })
  }

  // A winner is let through before the chain is consulted at all. Cheaper,
  // and it means the one group who most needs this page can never be locked
  // out of it by an endpoint having a bad minute.
  const won = hasWonSomething(address)

  if (config.gate && !won) {
    const held = await gateBalance(address)
    // 503, never "locked". Telling somebody they do not qualify because an
    // RPC blinked is the one wrong answer that costs them a mint.
    if (held === null) {
      return NextResponse.json(
        { error: 'Could not read the chain just now. Try again in a moment.' }, { status: 503 })
    }
    if (held < config.gate.min) {
      return NextResponse.json({
        locked: true, keys: held, need: config.gate.min,
        message: `The board is for ${config.gate.label}. ${held === 0
          ? `${config.gate.min} or more.` : `You hold ${held} of the ${config.gate.min} needed.`}`
          + ' If you won a spot, check you pasted the same wallet you won it on — winners get in'
          + ' whatever they hold now.',
        // Locked out of the board is not locked out of what is running.
        raffles: await liveRaffles(),
      }, { status: 403, headers: PRIVATE })
    }
    const board = await boardFor(address)
    return NextResponse.json({ locked: false, keys: held, ...board, raffles: await liveRaffles() },
      { headers: PRIVATE })
  }

  // Either there is no gate, or this wallet won something. A winner's key
  // count is still worth reporting, but an unreadable chain must not stop the
  // page rendering for them — so it is read leniently and may be null.
  const keys = config.gate ? await gateBalance(address) : null
  const board = await boardFor(address)
  return NextResponse.json({ locked: false, keys, wonSpot: won, ...board, raffles: await liveRaffles() },
    { headers: PRIVATE })
}
