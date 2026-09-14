import type { Metadata } from 'next'
import Directory from './Directory'
import Apply from './Apply'

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

      <p className="heading" id="apply">List your collection</p>
      <p className="lede" style={{ marginBottom: 16 }}>
        Finding communities usually means DMing one founder at a time and repeating yourself. Put it
        here once and the communities running boards can come to you.
      </p>
      <Apply />
    </main>
  )
}
