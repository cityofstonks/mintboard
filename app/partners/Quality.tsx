'use client'
import type { HolderStats } from '@/lib/types'

/**
 * How well a community held the allocation you gave them.
 *
 * Two segments, not three: of the wallets that took a spot and minted, how
 * many still hold one. Everything else sold. A third "bought more" slice
 * would double-count — somebody who sold their mint and bought two on
 * secondary is not a holder of what you gave them, and the keys-now line
 * below carries that signal without pretending it cancels a sale.
 */
export default function Quality({ s }: { s: HolderStats }) {
  const n = Math.max(1, s.minted)
  const heldPct = (s.held / n) * 100
  const sold = s.minted - s.held
  const parts = [
    { k: 'still holding', v: s.held, c: 'var(--accent)' },
    { k: 'sold', v: sold, c: 'var(--warn)' },
  ]
  const age = Math.floor((Date.now() - Date.parse(s.scannedAt)) / 86400_000)
  // Bought more than they were given. The one number a partner can be proud of.
  const grew = s.keysNow > s.minted

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
          <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round(heldPct)}%</b> still holding
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--warn)', display: 'inline-block' }} />
          <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{Math.round((sold / n) * 100)}%</b> sold
        </span>
      </div>
      <span className="note">
        {s.minted} of their wallets minted
        {grew
          ? ` · the room holds ${s.keysNow.toLocaleString()} now, so they kept buying`
          : ` · ${s.keysNow.toLocaleString()} left in the room`}
        {age > 0 && ` · scanned ${age} day${age === 1 ? '' : 's'} ago`}
      </span>
    </div>
  )
}
