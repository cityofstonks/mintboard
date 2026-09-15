'use client'
import { useEffect, useState } from 'react'
import type { HolderStats, Partner } from '@/lib/types'
import Quality from './Quality'

const fmt = (iso: string | null) => {
  if (!iso) return 'Date TBA'
  const d = new Date(iso)
  return isNaN(+d) ? 'Date TBA'
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function Directory() {
  const [list, setList] = useState<Partner[] | null>(null)
  const [stats, setStats] = useState<Record<string, HolderStats>>({})
  useEffect(() => {
    fetch('/api/partners').then(r => r.json()).then(d => setList(d.partners ?? [])).catch(() => setList([]))
    fetch('/api/holder-stats').then(r => r.json()).then(d => {
      const by: Record<string, HolderStats> = {}
      for (const s of d.stats ?? []) by[s.handle.toLowerCase()] = s
      setStats(by)
    }).catch(() => {})
  }, [])

  if (list === null) return <div className="empty">Loading…</div>
  if (!list.length) {
    return (
      <div className="empty" style={{ textAlign: 'left' }}>
        <strong style={{ color: 'var(--ink)' }}>No collections listed yet — be the first.</strong>
        <p className="note" style={{ margin: '8px 0 0' }}>
          This is where projects with a mint coming list what they can offer, so communities
          running boards come to them instead of the other way round. Nothing appears until an
          operator has checked it against the project&rsquo;s own account, which is why an empty
          list is better than a list you cannot trust.
        </p>
        <a className="btn" href="#apply" style={{ marginTop: 14 }}>List your collection</a>
      </div>
    )
  }

  return (
    <div className="cards">
      {list.map(p => (
        <article className="card" key={p.id}>
          <div className="code">{p.chain.toUpperCase()}{p.supply ? ` · ${p.supply.toLocaleString()} SUPPLY` : ''}</div>
          <h3>{p.url
            ? <a href={p.url} target="_blank" rel="noopener">{p.name}</a>
            : p.name}</h3>
          <div className="big" style={{ fontSize: 17 }}>{p.offer}</div>
          <div className="meta">{fmt(p.mintAt)}</div>
          {p.requirements && <div className="sub"><b>Asks for:</b> {p.requirements}</div>}
          {p.note && <div className="sub">{p.note}</div>}
          {stats[p.handle.toLowerCase()] && <Quality s={stats[p.handle.toLowerCase()]} />}
          <a className="enter" href={`https://x.com/${p.handle}`} target="_blank" rel="noopener">
            @{p.handle} →
          </a>
        </article>
      ))}
    </div>
  )
}
