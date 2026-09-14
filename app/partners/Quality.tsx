'use client'
import type { HolderStats } from '@/lib/types'

/**
 * What a community's minters did next.
 *
 * One bar, three segments, in the order that matters to somebody deciding
 * whether to spend their holders' attention on a partner: kept it, sold it,
 * bought more. Percentages are shares of the MINTERS, not of supply — one
 * whale minting fifty counts once, or a single wallet's behaviour stands in
 * for a whole community's.
 */
export default function Quality({ s }: { s: HolderStats }) {
  const n = Math.max(1, s.minters)
  const pct = (v: number) => (v / n) * 100
  const parts = [
    { k: 'held', v: s.held, c: 'var(--accent)' },
    { k: 'sold at some point', v: s.flipped, c: 'var(--warn)' },
    { k: 'bought more', v: s.accumulated, c: 'var(--accent-2)' },
  ]
  const age = Math.floor((Date.now() - Date.parse(s.scannedAt)) / 86400_000)

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 2 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden',
        background: 'var(--glass-soft)', border: '1px solid var(--edge)' }}>
        {parts.map(p => (
          <div key={p.k} title={`${p.k}: ${Math.round(pct(p.v))}%`}
            style={{ width: `${pct(p.v)}%`, background: p.c }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' }}>
        {parts.map(p => (
          <span key={p.k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 7, height: 7, borderRadius: 999, background: p.c, display: 'inline-block' }} />
            <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(pct(p.v))}%</b> {p.k}
          </span>
        ))}
      </div>
      <span className="note">
        {s.minters.toLocaleString()} minters
        {/*
          * "sold" is every minter who ever sold. Only say "within Nh" when the
          * scan actually recorded that split — captioning the all-time number
          * with a 24h window overstates how fast a community flips, and that
          * is the one figure a partner will come back and argue about.
          */}
        {typeof s.flippedWithin === 'number' &&
          ` · ${s.flippedWithin.toLocaleString()} of the ${s.flipped.toLocaleString()} sellers went inside ${s.windowHours}h`}
        {age > 0 && ` · scanned ${age} day${age === 1 ? '' : 's'} ago`}
      </span>
    </div>
  )
}
