import { NextResponse } from 'next/server'
import config from '@/mintboard.config'
import { boardFor } from '@/lib/board'
import { gateBalance, isAddress } from '@/lib/chain'
import { boardIcs } from '@/lib/ics'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const address = (new URL(req.url).searchParams.get('address') ?? '').trim()
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'need a wallet address' }, { status: 400 })
  }
  // Gated identically to /api/board: it carries the same facts and must not
  // become the way around the door.
  if (config.gate) {
    const held = await gateBalance(address)
    if (held === null) return NextResponse.json({ error: 'chain unreachable' }, { status: 503 })
    if (held < config.gate.min) return NextResponse.json({ locked: true }, { status: 403 })
  }
  const { rows } = await boardFor(address)
  return new NextResponse(boardIcs(rows, `${config.name} — your mints`), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mints.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
