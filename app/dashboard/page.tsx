import type { Metadata } from 'next'
import config from '@/mintboard.config'
import Dashboard from './Dashboard'

export const metadata: Metadata = {
  title: `Your collections — ${config.name}`,
  description: 'Claim a collection, keep its details right, and decide who else can manage it.',
}

export default function Page() {
  return (
    <main className="wrap">
      <h1>YOUR <span>COLLECTIONS</span></h1>
      <p className="lede" style={{ maxWidth: '62ch' }}>
        Claim a collection you run, keep its links and details right, and decide who else can act
        for it. What you set here is what holders see on the board and on every card.
      </p>
      <Dashboard />
    </main>
  )
}
