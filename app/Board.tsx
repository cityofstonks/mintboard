'use client'
import { useCallback, useEffect, useState } from 'react'
import type { BoardRow, HeldAsset, RaffleEntry } from '@/lib/types'

interface Payload {
  locked?: boolean; keys?: number | null; need?: number; message?: string
  rows?: BoardRow[]; holds?: HeldAsset[]; warnings?: string[]; raffles?: RaffleEntry[]
  error?: string
}

const RAILS: [string, string][] = [
  ['live', 'Minting now'], ['hour', 'Within the hour'], ['today', 'Later today'],
  ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['later', 'Further out'],
  ['tbd', 'No date announced'], ['done', 'Closed'],
]

const fmt = (iso: string | null) => {
  if (!iso) return 'TBD'
  const d = new Date(iso)
  return isNaN(+d) ? 'TBD'
    : d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()
}

/** A ticking gap, because "in 44 seconds" is a different instruction to a date. */
function countdown(iso: string | null, now: number) {
  if (!iso) return null
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms) || ms <= 0) return null
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60), sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

export default function Board({ embed = false }: { embed?: boolean }) {
  const [addr, setAddr] = useState('')
  const [data, setData] = useState<Payload | null>(null)
  const [raffles, setRaffles] = useState<RaffleEntry[]>([])
  const [busy, setBusy] = useState(false)
  // One clock for every countdown on the page, rather than a timer per card.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const check = useCallback(async (a: string) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(a.trim())) {
      setData({ error: 'That does not look like a wallet address — 0x, then 40 characters.' })
      return
    }
    setBusy(true)
    try {
      const r = await fetch(`/api/board?address=${encodeURIComponent(a.trim())}`)
      const d: Payload = await r.json()
      setData(d)
      try { localStorage.setItem('mintboard:addr', a.trim()) } catch {}
    } catch {
      setData({ error: 'Could not reach the board. Try again in a moment.' })
    } finally { setBusy(false) }
  }, [])

  // Raffles first, with no wallet: reading about an open door is not walking
  // through it, and asking for an address first gets the order backwards.
  useEffect(() => {
    fetch('/api/raffles').then(r => r.json()).then(d => setRaffles(d.raffles ?? [])).catch(() => {})
    try {
      const saved = localStorage.getItem('mintboard:addr')
      if (saved) { setAddr(saved); void check(saved) }
    } catch {}
  }, [check])

  const shown = data?.raffles ?? raffles
  const rows = data?.rows ?? []
  const dated = rows.filter(r => r.when).length

  return (
    <div className={embed ? 'embed' : ''}>
      <div className="wrap">
        <form className="ask" onSubmit={e => { e.preventDefault(); void check(addr) }}>
          <input value={addr} onChange={e => setAddr(e.target.value)} spellCheck={false}
            placeholder="0x… check a wallet for spots you have won" aria-label="wallet address" />
          <button type="submit" disabled={busy}>{busy ? 'Reading…' : 'Check my spots'}</button>
        </form>
        <p className="note">Read-only. Nothing is signed and nothing is stored.</p>

        {shown.length > 0 && (
          <section className="rail r-raffle">
            <h2><i />Raffles open now <b>{shown.length}</b></h2>
            <div className="cards">
              {shown.map(r => (
                <article className="card raffle" key={r.id}>
                  <div><span className="code">RAFFLE</span></div>
                  <h3>{r.project}</h3>
                  <div><span className="big">{countdown(r.closesAt, now) ?? fmt(r.closesAt)}</span>{' '}
                    <span className="at">entry closes</span></div>
                  <div className="tiers">
                    {r.tiers.map((t, i) => (
                      <span key={i}>
                        <b>{t.count === null ? '' : `${t.count} `}{t.label}</b> · {t.who}{' '}
                        {t.drawn ? '(drawn)' : '— not a draw, everyone who qualifies'}
                      </span>
                    ))}
                  </div>
                  {r.homework && <div className="meta">{r.homework}</div>}
                  {r.note && <span className="sub">{r.note}</span>}
                  {r.enterUrl && <a className="enter" href={r.enterUrl} target="_blank" rel="noopener">Enter →</a>}
                </article>
              ))}
            </div>
          </section>
        )}

        {data?.error && <div className="empty">{data.error}</div>}

        {data?.locked && (
          <div className="locked">
            <h2>Not yet</h2>
            <p>{data.message}</p>
            {shown.length > 0 && <p className="note" style={{ marginTop: 10 }}>The raffles above are open to everyone who qualifies for them.</p>}
          </div>
        )}

        {data && !data.locked && !data.error && rows.length === 0 && (
          <div className="empty" style={{ marginTop: 16 }}>
            <strong>No mints on your board yet.</strong><br />
            This only ever lists mints you can actually enter — spots you were drawn, or mints
            you qualify for by holding something.
          </div>
        )}

        {RAILS.map(([key, label]) => {
          const mine = rows.filter(r => r.bucket === key)
          if (!mine.length) return null
          return (
            <section className={`rail r-${key}`} key={key}>
              <h2><i />{label} <b>{mine.length}</b></h2>
              <div className="cards">
                {mine.map(r => (
                  <article className={`card${r.actions.length ? ' has-action' : ''}${r.state === 'live' ? ' is-live' : ''}`} key={r.code}>
                    <div><span className="code">{r.code}</span> <span className="tier">{r.tier}</span></div>
                    <h3>{r.url ? <a href={r.url} target="_blank" rel="noopener">{r.name}</a> : r.name}</h3>
                    <div>
                      <span className={`big s-${r.state}`}>
                        {r.state === 'live' ? 'MINTING NOW' : r.state === 'tbd' ? 'TBD' : (countdown(r.when, now) ?? fmt(r.when))}
                      </span>{' '}
                      {r.when && r.state !== 'live' && <span className="at">{fmt(r.when)}</span>}
                    </div>
                    {r.phases.length > 0 && (
                      <div className="phases">
                        {r.phases.map((p, i) => (
                          <span className={`ph${p.yours ? ' mine' : ''}`} key={i}>
                            {p.tier} {p.price === null ? 'FREE' : p.price ?? ''} {p.limit ? `×${p.limit}` : ''}{' '}
                            {p.opensAt ? fmt(p.opensAt) : 'TBD'}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="why">{r.reasons.map((x, i) => <b key={i}>{x}{i < r.reasons.length - 1 ? ' · ' : ''}</b>)}</div>
                    {r.deliverTo && <div className="meta">delivers to <b>{r.deliverTo}</b></div>}
                    {r.actions.map((a, i) => (
                      <p className="act" key={i}><b>Do this or you lose the spot</b>{a}</p>
                    ))}
                    {r.note && <span className="sub">{r.note}</span>}
                  </article>
                ))}
              </div>
            </section>
          )
        })}

        {(data?.warnings ?? []).map((w, i) => <p className="warn" key={i}>{w}</p>)}

        {rows.length > 0 && (
          <p className="note" style={{ marginTop: 14 }}>
            {rows.length} mint{rows.length === 1 ? '' : 's'} you qualify for. Times shown are <strong>your</strong> phase, not the public one.
            {dated > 0 && <> <a href={`/api/board/ics?address=${encodeURIComponent(addr)}`}>Add the {dated} dated one{dated === 1 ? '' : 's'} to your calendar</a>.</>}
          </p>
        )}

        {(data?.holds ?? []).length > 0 && (
          <>
            <p className="heading">What you hold</p>
            <div className="held">
              {data!.holds!.map(h => <span key={h.collection}>{h.name} <b>{h.count}</b></span>)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
