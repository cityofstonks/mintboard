import { NextResponse } from 'next/server'
import { liveRaffles } from '@/lib/raffles'
import { allCommunities } from '@/lib/communities'

export const dynamic = 'force-dynamic'

/**
 * Ungated on purpose. Entering a raffle may need a token; READING about one
 * does not, and asking for a wallet before anybody can see what is open gets
 * the order backwards. Nothing here is per-wallet, so there is nothing to leak.
 */
export async function GET() {
  return NextResponse.json({ raffles: await liveRaffles(), communities: allCommunities() }, {
    /*
     * Shared, identical for everybody, and it changes when an operator adds a
     * raffle — a few times a day, not a few times a second. Serve it from the
     * edge for 30s and keep serving the stale copy for 5 minutes while it
     * refreshes behind the reader, so a board opened by 500 holders at once
     * is 500 edge hits rather than 500 origin invocations.
     *
     * The window is the honest cost: someone can see a raffle up to 30s after
     * it is posted. A countdown is rendered client-side from closesAt, so it
     * stays correct regardless of when the payload was cached.
     */
    headers: { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=300' },
  })
}
