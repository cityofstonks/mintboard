'use client'
import type { HolderStats } from '@/lib/types'

/**
 * How well a community held the allocation you gave them.
 *
 * SOLD / HOLD / GOLD.
 *
 * The bar is two segments and sums to 100%: of the wallets that took a spot
 * and minted, how many still HOLD one. Everything else SOLD.
 *
 * GOLD sits OUTSIDE the bar on purpose. It overlaps both segments —
 * a wallet can sell the one it minted and still buy three on secondary — so
 * adding it as a third slice would count those wallets twice and quietly push
 * the sold share down. It is its own measure, so it gets its own line.
 */
export default function Quality({ s }: { s: HolderStats }) {
  const n = Math.max(1, s.minted)
  const heldPct = (s.held / n) * 100
  const sold = s.minted - s.held
  const parts = [
    { k: 'HOLD', v: s.held, c: 'var(--accent)' },
    { k: 'SOLD', v: sold, c: 'var(--warn)' },
  ]
  const age = Math.floor((Date.now() - Date.parse(s.scannedAt)) / 86400_000)

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 2 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden',
        background: 'var(--glass-soft)', border: '1px solid var(--edge)' }}>
        {parts.map(p => (
          <div key={p.k} title={`${p.k}: ${Math.round((p.v / n) * 100)}%`}
            style={{ width: `${(p.v / n) * 100}%`, background: p.c }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent)', display: 'inline-block' }} />
          <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(heldPct)}%</b> <b style={{ letterSpacing: '.06em' }}>HOLD</b>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--warn)', display: 'inline-block' }} />
          <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round((sold / n) * 100)}%</b> <b style={{ letterSpacing: '.06em' }}>SOLD</b>
        </span>
      </div>

      {/* Its own row, separated by a rule, so it never reads as part of the bar. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5,
        color: 'var(--muted)', borderTop: '1px solid var(--edge)', paddingTop: 7 }}>
        <i style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--accent-2)',
          display: 'inline-block', flexShrink: 0 }} />
        <b style={{ color: s.boughtMore ? 'var(--ink)' : 'var(--faint)', fontWeight: 600 }}>
          {Math.round((s.boughtMore / n) * 100)}%
        </b>
        <b style={{ letterSpacing: '.06em' }}>GOLD</b> — bought more than they were given
      </div>
      <span className="note">
        {s.minted} of their wallets minted · {s.keysNow.toLocaleString()} in the room now
        {age > 0 && ` · scanned ${age} day${age === 1 ? '' : 's'} ago`}
      </span>
    </div>
  )
}
