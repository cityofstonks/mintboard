import { NextResponse } from 'next/server'
import { allStats } from '@/lib/holderStats'

/** Aggregate counts only — no wallet ever appears here, so it is not gated. */
export async function GET() {
  return NextResponse.json({ stats: allStats() })
}
