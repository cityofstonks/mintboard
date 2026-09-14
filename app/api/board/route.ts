import { NextResponse } from 'next/server'
import config from '@/mintboard.config'
import { boardFor } from '@/lib/board'
import { gateBalance, isAddress } from '@/lib/chain'
import { liveRaffles } from '@/lib/raffles'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const address = (new URL(req.url).searchParams.get('address') ?? '').trim()
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'need a wallet address' }, { status: 400 })
  }

  if (config.gate) {
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
          ? `${config.gate.min} or more.` : `You hold ${held} of the ${config.gate.min} needed.`}`,
        // Locked out of the board is not locked out of what is running.
        raffles: liveRaffles(),
      }, { status: 403 })
    }
    const board = await boardFor(address)
    return NextResponse.json({ locked: false, keys: held, ...board, raffles: liveRaffles() })
  }

  const board = await boardFor(address)
  return NextResponse.json({ locked: false, keys: null, ...board, raffles: liveRaffles() })
}
