import config from '@/mintboard.config'
import type { Metadata } from 'next'
import Opportunities from './Opportunities'
import HeroDemo from './HeroDemo'
import spots from '@/data/spots.json'
import mints from '@/data/mints.json'
import type { SpotList, MintEntry } from '@/lib/types'

/*
 * Counted, not typed out.
 *
 * This paragraph used to read "232 wallets across nine mints". Both numbers
 * were true the day they were written and neither was true a fortnight later:
 * 232 was the number of spot ROWS, the unique wallet count is less than half
 * that, and a mint had come off the list. A landing page whose whole claim is
 * "live, not a demo" cannot carry numbers that quietly go stale — that is the
 * one place a wrong figure costs trust rather than accuracy.
 */
const LISTS = spots as Record<string, SpotList>
const WALLETS = new Set(
  Object.values(LISTS).flatMap(l => (l.wallets ?? []).map(w => String(w).toLowerCase())),
).size
const MINTS = (mints as MintEntry[]).length

export const metadata: Metadata = {
  title: `${config.name} — a mint board for NFT communities`,
  description:
    'Show every holder only the mints they actually qualify for, and the raffles they can still enter. Deploy your own in a minute.',
}

const RULES = [
  {
    k: 'Only what is true of you',
    v: `A mint appears only if the wallet reading it qualifies — a spot it was drawn, or an asset it
        holds, read from the chain on every load. Not on the list? Not on the board. That is the
        difference between a board and an advert, and it is why holders check it instead of asking
        in your chat.`,
  },
  {
    k: 'Your window, not the public one',
    v: `A mint is rarely one time. It is a run of windows at different prices with different caps.
        Each holder sees theirs counting down — because a guaranteed holder shown the public time
        turns up two hours late.`,
  },
  {
    k: 'It never says no by accident',
    v: `If a chain does not answer, holders get a warning rather than a "no". Telling somebody they
        do not qualify because an endpoint blinked is the one wrong answer that costs them a mint.`,
  },
  {
    k: 'What they still owe',
    v: `Won a spot but never filed the comment the project asked for? Posted a Bitcoin address that
        cannot hold an inscription? That row sorts above everything else, because it is the only one
        that expires — and a spot nobody claims goes back to the project.`,
  },
]

const STEPS = [
  ['Deploy your own', 'Fork it, click deploy, and you have a board with its own address in about a minute. No server, no database, no wallet connection.'],
  ['Point it at your chains', 'One config file: your name, your two accent colours, the chains you read and the collections that count.'],
  ['Drop in your raffles and winners', 'Three JSON files, or the admin page for whoever runs your raffles. Closed raffles fall off the board on their own.'],
  ['Put it on your site', 'One iframe. It reports its own height, so there is no scrollbar and no slab of dead space.'],
]

export default function Landing() {
  return (
    <main>
      <section className="wrap hero" style={{ paddingTop: 'clamp(40px, 9vh, 92px)', paddingBottom: 40 }}>
       <div>
        <p className="code" style={{ marginBottom: 18 }}>OPEN SOURCE · MIT · NO DATABASE</p>
        <h1 style={{ maxWidth: '16ch' }}>
          Every holder sees <span>only the mints they can enter</span>
        </h1>
        <p className="lede" style={{ fontSize: 18, maxWidth: '58ch' }}>
          A holder pastes an address — nothing signed, nothing stored — and gets the spots they
          hold, the tier, the reason, and a countdown to <em>their</em> window rather than the
          public one. You stop answering &ldquo;am I on the list?&rdquo; forty times a day.
        </p>
        <p className="lede" style={{ maxWidth: '58ch', marginTop: 14 }}>
          The board below is <strong>live, not a demo</strong> — it is City of Stonks&rsquo; own,
          running {WALLETS} wallets across {MINTS} mints. Paste a key holder&rsquo;s address and
          check it against what you already know.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '28px 0 0' }}>
          <a className="btn" href="/board">Check a wallet</a>
          <a className="btn" href="/guide" style={{
            background: 'var(--glass)', color: 'var(--ink)', border: '1px solid var(--edge)',
            boxShadow: 'none', backdropFilter: 'blur(12px)',
          }}>Put one on your site</a>
        </div>
       </div>
       {/* The product, running. The right half of this section used to be empty. */}
       <HeroDemo />
      </section>

      <Opportunities />

      <section className="wrap" style={{ paddingTop: 0, paddingBottom: 40 }}>
        <div className="rules">
          {RULES.map(r => (
            <article className="card" key={r.k}>
              <h3 style={{ fontSize: 17 }}>{r.k}</h3>
              <p className="sub" style={{ margin: 0 }}>{r.v}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 0, paddingBottom: 40 }}>
        <div className="pane" style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
          <h2>Four steps, and none of them is &ldquo;hire a developer&rdquo;</h2>
          <p className="lede" style={{ marginBottom: 22 }}>
            The data lives in three JSON files you can edit from the GitHub web page — because the
            person who runs your raffles is usually not the person who knows how to run git.
          </p>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 16 }}>
            {STEPS.map(([t, d], i) => (
              <li key={t} style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: 14, alignItems: 'start' }}>
                <span className="code" style={{ color: 'var(--accent)', paddingTop: 3 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <strong style={{ fontWeight: 600 }}>{t}</strong>
                  <p className="sub" style={{ margin: '2px 0 0' }}>{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 0 }}>
        <div className="pane" style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
          <p className="code" style={{ color: 'var(--accent-2)' }}>FOR COLLECTIONS</p>
          <h2 style={{ marginTop: 8 }}>Stop DMing founders one at a time</h2>
          <p className="lede">
            Got a mint coming and spots to give away? List it once and the communities running boards
            come to you. Every listing is checked against its own account before it appears, and your
            contact details never go on the public page.
          </p>
          <a className="btn" href="/partners#apply" style={{ marginTop: 8 }}>List your collection</a>
        </div>

        <p className="note" style={{ marginTop: 36, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <a href="/board">The board</a>
          <a href="/guide">Guide</a>
          <a href="/partners">Collections</a>
          <a href="/admin">Admin</a>
        </p>
      </section>
    </main>
  )
}
