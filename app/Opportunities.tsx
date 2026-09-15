'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Community, RaffleEntry } from '@/lib/types'

/**
 * What is open right now, and whose room you have to be in to enter it.
 *
 * This is the front door for somebody who has not pasted a wallet and may not
 * hold anything yet. The board answers "does THIS wallet qualify"; this
 * answers the question that comes before it — "is there anything here for me,
 * and if not, who would I have to join". So every card carries its
 * communities, and every community carries the links to go and find it.
 *
 * A SLIDER, NOT A GRID. Open opportunities are a short, urgent, ordered list —
 * the one closing first matters most and should be the one you land on. A grid
 * flattens that ordering into reading-order and buries the deadline. It scrolls
 * with a real scrollbar and snaps, so it works with a trackpad, a thumb, the
 * arrow keys and a screen reader without a carousel library.
 */

const fmt = (iso: string | null) => {
  if (!iso) return 'TBD'
  const d = new Date(iso)
  return isNaN(+d) ? 'TBD'
    : d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()
}

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

/** One community's links. Renders nothing for a link that does not exist. */
function CommunityBoard({ c }: { c: Community }) {
  const links: [string, string][] = []
  if (c.x) links.push(['X', `https://x.com/${c.x.replace(/^@/, '')}`])
  if (c.discord) links.push(['Discord', c.discord])
  if (c.opensea) links.push(['OpenSea', c.opensea])

  return (
    <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 10, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>{c.icon ?? '◆'}</span>
        <b style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</b>
      </div>
      {c.blurb && <span className="note" style={{ margin: 0 }}>{c.blurb}</span>}
      {links.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {links.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener"
              aria-label={`${c.name} on ${label}`}
              style={{
                fontSize: 12, fontWeight: 560, letterSpacing: '.02em',
                padding: '5px 11px', borderRadius: 999, textDecoration: 'none',
                background: 'var(--glass-soft)', border: '1px solid var(--edge)', color: 'var(--muted)',
              }}>{label} &rarr;</a>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Opportunities() {
  const [raffles, setRaffles] = useState<RaffleEntry[]>([])
  const [communities, setCommunities] = useState<Community[]>([])
  const [pick, setPick] = useState<string>('all')
  const [loaded, setLoaded] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const rail = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/raffles')
      .then(r => r.json())
      .then(d => { setRaffles(d.raffles ?? []); setCommunities(d.communities ?? []) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Same adaptive clock as the board: seconds only matter inside the last hour.
  const soonest = useMemo(() => {
    const t = raffles.map(r => (r.closesAt ? Date.parse(r.closesAt) : NaN))
      .filter(x => Number.isFinite(x) && x > Date.now())
    return t.length ? Math.min(...t) : null
  }, [raffles])
  useEffect(() => {
    if (soonest === null) return
    const every = soonest - Date.now() < 3600_000 ? 1000 : 30_000
    let id: ReturnType<typeof setInterval>
    const run = () => { setNow(Date.now()); id = setInterval(() => setNow(Date.now()), every) }
    const onVis = () => { clearInterval(id); if (!document.hidden) run() }
    if (!document.hidden) run()
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [soonest])

  /** Communities that actually gate something open — never a dead filter. */
  const usable = useMemo(() => {
    const live = new Set(raffles.flatMap(r => r.communities ?? []))
    return communities.filter(c => live.has(c.id))
  }, [raffles, communities])

  const shown = useMemo(() => pick === 'all'
    ? raffles
    : raffles.filter(r => (r.communities ?? []).includes(pick)), [raffles, pick])

  const byId = useMemo(() => new Map(communities.map(c => [c.id, c])), [communities])

  const nudge = useCallback((dir: 1 | -1) => {
    const el = rail.current
    if (!el) return
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.9, 380), behavior: 'smooth' })
  }, [])

  if (loaded && raffles.length === 0) return null

  return (
    <section className="wrap" style={{ paddingTop: 0, paddingBottom: 40 }} aria-labelledby="opps-h">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 id="opps-h" style={{ fontSize: 20 }}>Open right now</h2>
        {loaded && <span className="note">{shown.length} of {raffles.length}</span>}
      </div>
      <p className="lede" style={{ marginBottom: 14 }}>
        Everything you can enter today, and whose community you need to be in to do it.
        No wallet needed to look.
      </p>

      {usable.length > 0 && (
        <div role="group" aria-label="Filter by community"
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {[{ id: 'all', name: 'Everything', icon: '✦' } as Community, ...usable].map(c => {
            const on = pick === c.id
            const count = c.id === 'all' ? raffles.length
              : raffles.filter(r => (r.communities ?? []).includes(c.id)).length
            return (
              <button key={c.id} type="button" onClick={() => setPick(c.id)}
                aria-pressed={on}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '9px 14px', borderRadius: 999, fontSize: 13.5, fontWeight: 560,
                  cursor: 'pointer', transition: 'border-color .15s, background .15s',
                  background: on ? 'color-mix(in oklab, var(--accent) 16%, transparent)' : 'var(--glass-soft)',
                  border: `1px solid ${on ? 'color-mix(in oklab, var(--accent) 60%, transparent)' : 'var(--edge)'}`,
                  color: on ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: 'none',
                }}>
                <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>{c.icon ?? '◆'}</span>
                {c.name}
                <span className="code" style={{ color: 'inherit', opacity: .7 }}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div ref={rail} className="rail-scroll" tabIndex={0} role="list"
          aria-label="Open opportunities"
          style={{
            display: 'grid', gridAutoFlow: 'column',
            gridAutoColumns: 'minmax(min(300px, 85%), 340px)',
            gap: 14, overflowX: 'auto', overflowY: 'hidden',
            scrollSnapType: 'x mandatory', scrollPadding: 2, paddingBottom: 10,
          }}>
          {!loaded && <article className="card" aria-hidden="true" style={{ minHeight: 210, opacity: .5 }} />}
          {shown.map(r => {
            const claim = r.kind === 'claim'
            const mine = (r.communities ?? []).map(id => byId.get(id)).filter(Boolean) as Community[]
            return (
              <article className="card raffle" key={r.id} role="listitem"
                style={{ scrollSnapAlign: 'start' }}>
                <div>
                  <span className="code">{claim ? 'CLAIM' : 'RAFFLE'}</span>{' '}
                  <span className="tier">{claim ? 'NO DRAW' : 'CLOSES SOON'}</span>
                </div>
                <h3>{r.project}</h3>
                <div>
                  {r.closesAt
                    ? <><span className="big">{countdown(r.closesAt, now) ?? fmt(r.closesAt)}</span>{' '}
                        <span className="at">{claim ? 'closes' : 'entry closes'}</span></>
                    : <><span className="big">OPEN NOW</span>{' '}
                        <span className="at">until it fills</span></>}
                </div>
                <div className="tiers">
                  {r.tiers.map((t, i) => (
                    <span key={i}>
                      <b>{t.count === null ? '' : `${t.count} `}{t.label}</b> · {t.who}
                    </span>
                  ))}
                </div>
                {r.note && <span className="sub">{r.note}</span>}

                {mine.length > 0 ? mine.map(c => <CommunityBoard key={c.id} c={c} />) : (
                  <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 10 }}>
                    <span className="note" style={{ margin: 0 }}>Open to everyone — no community needed.</span>
                  </div>
                )}

                {(r.url || r.enterUrl) && (
                  <a className="enter" href={r.url || r.enterUrl} target="_blank" rel="noopener">
                    {claim ? 'Claim your spot →' : 'Enter →'}
                  </a>
                )}
              </article>
            )
          })}
          {loaded && shown.length === 0 && (
            <div className="empty" style={{ minWidth: 300 }}>
              Nothing open for that community right now. Everything else is one tap away.
            </div>
          )}
        </div>

        {/* Arrows are an extra, never the only way through — the rail is a real
            scroll container, so a trackpad, a thumb and the keyboard all work. */}
        {shown.length > 1 && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="ghost" onClick={() => nudge(-1)} aria-label="Scroll left"
              style={{ padding: '6px 14px' }}>←</button>
            <button type="button" className="ghost" onClick={() => nudge(1)} aria-label="Scroll right"
              style={{ padding: '6px 14px' }}>→</button>
          </div>
        )}
      </div>
    </section>
  )
}
