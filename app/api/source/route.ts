/**
 * The board's data, for anyone rendering their own.
 *
 * Mintboard is the control for City of Stonks' /theboard. The engine used to
 * keep its own copy of these two files and they drifted exactly as two copies
 * always do — Zorpians read MINTING NOW for two days after it shut, and the
 * Toadstools date reached one board and not the other one that twenty-five
 * winners had been pointed at.
 *
 * Everything here is already public: these are the same mints and spot lists
 * the board renders to anyone who asks. There is nothing to gate.
 *
 * SERVED WITH AN ETAG, because the consumer polls. A board that has not
 * changed should cost a 304 and nothing else.
 */
import { NextRequest, NextResponse } from 'next/server'
import mints from '@/data/mints.json'
import spots from '@/data/spots.json'

export const dynamic = 'force-dynamic'

/**
 * A weak fingerprint of the payload. Not cryptographic — it only has to change
 * when the data does, and be cheap enough to compute per request.
 */
function tag(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return `W/"${(h >>> 0).toString(36)}-${s.length.toString(36)}"`
}

export async function GET(req: NextRequest) {
  const payload = JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    mints,
    spots,
  })
  const etag = tag(payload)

  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { etag } })
  }

  return new NextResponse(payload, {
    headers: {
      'content-type': 'application/json',
      etag,
      // Short, because a spot list can change the moment a draw lands, and a
      // stale board is the thing this endpoint exists to prevent.
      'cache-control': 'public, max-age=30, stale-while-revalidate=300',
      'access-control-allow-origin': '*',
    },
  })
}
