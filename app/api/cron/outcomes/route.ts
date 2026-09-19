/**
 * Re-measure how our winners behaved with the spots we won them.
 *
 * Runs on a schedule because the number changes without anybody telling us:
 * a holder sells at 3am and the next partner to ask about our retention gets
 * a stale answer. Toadstools said out loud they kept every wallet from every
 * community that minted — the figure is being computed about us whether or
 * not we compute it ourselves.
 *
 * Reads only. It writes its result to the database rather than the repo,
 * because a cron that commits to git is a cron that eventually force-pushes
 * over somebody's work. The JSON in data/ stays the seeded baseline; live
 * numbers come from here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { inscriptionsOf, ofCollection } from '@/lib/inscriptions'
import { insert } from '@/lib/db'
import mints from '@/data/mints.json'
import spots from '@/data/spots.json'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface Mint { code: string; name: string; marker?: string; spotsList?: string; chain?: string
  eligibility?: { via: string; list?: string }[] }

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'no' }, { status: 401 })

  const out: any[] = []
  for (const m of mints as Mint[]) {
    // Only collections that mark their own inscriptions can be counted without
    // an indexer. Everything else is skipped rather than guessed at.
    if (!m.marker) continue
    const listId = m.spotsList ?? m.eligibility?.find(e => e.via === 'spots')?.list
    const list = listId ? (spots as any)[listId] : null
    if (!list) continue

    const targets = [...new Set([
      ...Object.values(list.delivery ?? {}) as string[],
      ...(list.deliveryExtra ?? []) as string[],
    ])]
    if (!targets.length) continue

    let held = 0, none = 0, unreadable = 0
    for (const addr of targets) {
      const ids = await inscriptionsOf(addr)
      // null is "the explorer would not answer", which is not "they sold".
      if (ids === null) { unreadable++; continue }
      ofCollection(ids, m.marker).length ? held++ : none++
      await new Promise(s => setTimeout(s, 1100))
    }

    const row = {
      code: m.code, name: m.name, chain: 'bitcoin',
      spots: Math.max(list.expected ?? 0, targets.length),
      checked: held + none, held, not_holding: none, unreadable,
      scanned_at: new Date().toISOString(),
    }
    out.push(row)
    /*
     * This pass distinguishes holding from not-holding, and deliberately does
     * NOT split not-holding into sold vs never-minted. That split needs the
     * spend-tracing the script does, which is far too many requests for a
     * scheduled function. The seeded baseline carries the split; this keeps
     * the live retention honest between full scans.
     */
    await insert('spot_outcome_scans', row).catch(() => {})
  }
  return NextResponse.json({ ok: true, scanned: out.length, results: out })
}
