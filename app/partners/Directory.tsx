'use client'
import { useEffect, useState } from 'react'
import type { Partner } from '@/lib/types'

const fmt = (iso: string | null) => {
  if (!iso) return 'Date TBA'
  const d = new Date(iso)
  return isNaN(+d) ? 'Date TBA'
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function Directory() {
  const [list, setList] = useState<Partner[] | null>(null)
  useEffect(() => {
    fetch('/api/partners').then(r => r.json()).then(d => setList(d.partners ?? [])).catch(() => setList([]))
  }, [])

  if (list === null) return <div className="empty">Loading…</div>
  if (!list.length) {
    return (
      <div className="empty">
        <strong>No collections listed yet.</strong>
        <p className="note" style={{ margin: '8px 0 0' }}>
          Projects appear here once an operator has approved them — nothing shows up unchecked.
        </p>
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
          <a className="enter" href={`https://x.com/${p.handle}`} target="_blank" rel="noopener">
            @{p.handle} →
          </a>
        </article>
      ))}
    </div>
  )
}
