/**
 * Checking a Bitcoin address, without an indexer.
 *
 * Every free ordinals indexer has closed: Hiro is deprecated, Ordiscan and
 * Unisat want a key, Magic Eden was returning 503. So this does not pretend to
 * list what an address holds. It answers the question that actually loses
 * people their inscription — is this address the right SHAPE, and does it
 * exist on chain — and says plainly that it is not counting inscriptions.
 *
 * Saying "0 inscriptions" because we could not look would be the same mistake
 * that runs through everything else here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { readAddress } from '@/lib/bitcoin'

export const dynamic = 'force-dynamic'

interface Chain { funded: number; spent: number; txs: number }

async function onChain(address: string): Promise<Chain | null> {
  for (const url of [
    `https://blockstream.info/api/address/${address}`,
    `https://mempool.space/api/address/${address}`,
  ]) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
      if (!r.ok) continue
      const j = await r.json() as { chain_stats?: { funded_txo_count: number; spent_txo_count: number; tx_count: number } }
      const c = j.chain_stats
      if (!c) continue
      return { funded: c.funded_txo_count, spent: c.spent_txo_count, txs: c.tx_count }
    } catch { /* try the next one */ }
  }
  return null
}

export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get('address') ?? '').trim()
  if (!address) return NextResponse.json({ error: 'no address given' }, { status: 400 })

  const read = readAddress(address)
  if (!read.canHoldInscription) {
    return NextResponse.json({ address, kind: read.kind, ok: false, why: read.why })
  }

  const chain = await onChain(address.toLowerCase())
  return NextResponse.json({
    address, kind: read.kind, ok: true,
    // null, never 0 — "we could not reach a node" is a different answer from
    // "this address has never been used".
    chain,
    unused: chain ? chain.txs === 0 : null,
    note: 'Inscription counts are not available — every free ordinals indexer now requires a key.',
  })
}
