import { NextResponse } from 'next/server'
import { allStats } from '@/lib/holderStats'
import { listable, standing } from '@/lib/stats'

/** Aggregate counts only — no wallet ever appears here, so it is not gated. */
export async function GET() {
  // The same floor the page applies. An endpoint that returns everything
  // while the page hides half of it is not a filter, it is a decoration.
  const all = allStats()
  return NextResponse.json({
    stats: listable(all),
    hidden: all.filter(s => standing(s) === 'below-floor').length,
    unranked: all.filter(s => standing(s) === 'too-few').length,
  })
}
