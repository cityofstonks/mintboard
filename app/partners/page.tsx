import type { Metadata } from 'next'
import Directory from './Directory'
import Apply from './Apply'
import Quality from './Quality'
import { allStats, byRetention } from '@/lib/holderStats'

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

      {allStats().length > 0 && (
        <>
          <p className="heading">What their holders did last time</p>
          <p className="lede" style={{ marginBottom: 16 }}>
            Every one of these communities was given an allocation here. This is what they did
            with it: of the wallets that took a spot and minted, how many still hold one.
            Read off our own Transfer logs, counting wallets rather than tokens, so a room
            that minted fifty between three people cannot look like fifty holders.
          </p>
          <div className="cards">
            {byRetention(allStats()).map(s => (
              <article className="card" key={s.handle}>
                <div className="code">COLLAB</div>
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
