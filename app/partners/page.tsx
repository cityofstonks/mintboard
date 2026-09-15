import type { Metadata } from 'next'
import Directory from './Directory'
import Apply from './Apply'
import Quality from './Quality'
import { allStats, byRetention } from '@/lib/holderStats'
import { listable, standing, PARTNER_FLOOR, MIN_SAMPLE } from '@/lib/stats'

export const metadata: Metadata = {
  title: 'Collections — Mintboard',
  description: 'Projects offering allocation to communities, and a form to list your own.',
}

export default function Partners() {
  return (
    <main className="wrap">
      <p className="note"><a href="/board">← back to the board</a></p>
      <h1>OFFERING <span>ALLOCATION</span></h1>
      <p className="lede">
        Collections with a mint coming that want communities to hand their spots out. Every one has
        been checked against its own account before it appears here.
      </p>

      <p className="heading">Open right now</p>
      <Directory />

      {listable(allStats()).length > 0 && (
        <>
          <p className="heading">What their holders did last time</p>
          <p className="lede" style={{ marginBottom: 16 }}>
            <b>SOLD / HOLD / GOLD.</b> Of the wallets given an allocation, how many still hold
            what they minted. <b>HOLD</b> do. <b>SOLD</b> do not. <b>GOLD</b> went and bought more
            than they were given. Counted as wallets rather than tokens, so a room that minted
            fifty between three people cannot look like fifty holders.
          </p>
          <p className="lede" style={{ marginBottom: 16 }}>
            The row marked <b style={{ color: 'var(--accent)' }}>OUR ROOM</b> is the other
            direction: allocations <em>we</em> were given, across three mints, and what our holders
            did with them. It is the same question asked of us, which is the only reason it belongs
            in the same table.
          </p>
          <p className="lede" style={{ marginBottom: 16 }}>
            {/*
              * Stated on the page rather than applied quietly. A directory that
              * silently drops rooms is a directory nobody can trust; one that
              * publishes its bar can be argued with, which is the point.
              */}
            <b>Only rooms holding {Math.round(PARTNER_FLOOR * 100)}% or better are listed.</b>{' '}
            Below that a community is not shown here and does not surface in collab matching — it
            can still come to us directly. This grades <em>rooms, not art</em>: a low number means
            the people handed an allocation sold it, which is a fact about a community and the one
            fact a project needs before deciding where its spots go. Rooms with fewer than{' '}
            {MIN_SAMPLE} mints are not ranked at all, because too new to measure is a different
            thing from measured and poor.
          </p>
          <div className="cards">
            {byRetention(listable(allStats())).map((s, i) => (
              <article className="card" key={s.handle}
                style={s.outbound ? { borderColor: 'color-mix(in oklab, var(--accent) 45%, transparent)' } : undefined}>
                <div className="code" style={s.outbound ? { color: 'var(--accent)' } : undefined}>
                  #{i + 1} · {s.outbound ? 'OUR ROOM' : 'COLLAB'}
                </div>
                <h3>{s.collection}</h3>
                <Quality s={s} />
              </article>
            ))}
          </div>
        </>
      )}

      <p className="heading" id="apply">List your collection</p>
      <p className="lede" style={{ marginBottom: 16 }}>
        Finding communities usually means DMing one founder at a time and repeating yourself. Put it
        here once and the communities running boards can come to you.
      </p>
      <Apply />
    </main>
  )
}
