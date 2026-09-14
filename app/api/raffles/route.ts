import { NextResponse } from 'next/server'
import { liveRaffles } from '@/lib/raffles'

export const dynamic = 'force-dynamic'

/**
 * Ungated on purpose. Entering a raffle may need a token; READING about one
 * does not, and asking for a wallet before anybody can see what is open gets
 * the order backwards. Nothing here is per-wallet, so there is nothing to leak.
 */
export async function GET() {
  return NextResponse.json({ raffles: await liveRaffles() })
}
