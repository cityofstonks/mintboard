import type { Metadata } from 'next'
import config from '@/mintboard.config'
import mints from '@/data/mints.json'
import spots from '@/data/spots.json'
import { liveRaffles } from '@/lib/raffles'
import { allCommunities } from '@/lib/communities'
import { stateOf } from '@/lib/when'
import type { MintEntry, SpotList } from '@/lib/types'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Everything coming up — ${config.name}`,
  description: 'Every mint this community holds spots in, and every door open right now.',
}

/**
 * The whole board at once, without a wallet.
 *
 * /board answers "what does THIS address qualify for" and needs an address.
 * That is the right question for a holder and the wrong one for everybody
 * else — an operator deciding what to chase, a member wondering whether it is
 * worth holding a key, a project deciding whether this room is worth spots.
 *
 * So this counts rather than filters: how many spots the community holds in
 * each mint, which tiers, and what is still open to enter. Nobody's wallet
 * appears, which is also why it can be public.
 */

const MINTS = mints as MintEntry[]
const SPOTS = spots as Record<string, SpotList>

const fmt = (iso: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(+d) ? null
    : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}

export default async function Upcoming() {
  const now = Date.now()
  const raffles = await liveRaffles().catch(() => [])
  const communities = allCommunities()

  const rows = MINTS.map(m => {
    const tiers = (m.eligibility ?? []).map(e => {
      const list = e.via === 'spots' ? SPOTS[e.list] : undefined
      return { tier: e.tier, have: list?.wallets.length ?? 0 }
    })
    // An explicit end beats the grace timer. stateOf already takes a close,
    // so passing endedAt makes a finished mint read as finished immediately
    // rather than when a 24-hour window happens to run out.
    const state = stateOf(m.startsAt ?? null, now, m.endedAt ?? null)
    return {
      code: m.code, name: m.name, url: m.url, note: m.note,
      when: m.startsAt, endedAt: m.endedAt ?? null, state,
      tiers, total: tiers.reduce((a, t) => a + t.have, 0),
    }
  })

  // Dated first, soonest at the top; undated after. A mint with a date is the
  // one that can be missed.
  rows.sort((a, b) => {
    const x = a.when ? Date.parse(a.when) : NaN, y = b.when ? Date.parse(b.when) : NaN
    if (Number.isFinite(x) && Number.isFinite(y)) return x - y
    if (Number.isFinite(x)) return -1
    if (Number.isFinite(y)) return 1
    return a.name.localeCompare(b.name)
  })

  /*
   * Done and still to come.
   *
   * A mint that has been and gone is not clutter to hide — it is the only
   * evidence a stranger has that this room actually gets spots and actually
   * delivers them. Anybody weighing whether to join, or whether to hand over
   * an allocation, is asking "has this worked before", and a page that only
   * ever shows the future cannot answer that.
   */
  const done = rows.filter(r => r.state === 'closed')
  const ahead = rows.filter(r => !done.includes(r))
  const totalSpots = rows.reduce((a, r) => a + r.total, 0)
  const deliveredSpots = done.reduce((a, r) => a + r.total, 0)
  /*
   * The soonest thing with a date, for the third tile.
   *
   * This slot used to hold a count of spots whose winner never filed a wallet.
   * It was accurate and it did not belong: an operational gap we close by
   * chasing people is not a headline, and putting it on a public page told
   * every project reading it that spots they gave us went to waste. That
   * number still exists where it is useful — the engine's spot-wallet-audit
   * reports it privately — and nowhere a partner has to read it.
   */
  const next = ahead.find(r => r.when && Date.parse(r.when) > now && r.state !== 'live')

  return (
    <main className="wrap">
      <h1>EVERYTHING <span>COMING UP</span></h1>
      <p className="lede" style={{ maxWidth: '62ch' }}>
        Every mint this community holds spots in, and every door open right now. No wallet needed —
        this counts what the room has rather than what you have. For your own spots,{' '}
        <a href="/board">check a wallet</a>.
      </p>

      <div className="cards" style={{ margin: '22px 0 8px' }}>
        <article className="card">
          <div className="code">SPOTS WON</div>
          <span className="big">{totalSpots}</span>
          <span className="sub">
            across {rows.length} mints
            {deliveredSpots > 0 && <> · <b style={{ color: 'var(--ink)' }}>{deliveredSpots}</b> already delivered</>}
          </span>
        </article>
        <article className="card">
          <div className="code">OPEN NOW</div>
          <span className="big">{raffles.length}</span>
          <span className="sub">{raffles.length === 1 ? 'door you can still enter' : 'doors you can still enter'}</span>
        </article>
        <article className="card">
          <div className="code">NEXT UP</div>
          <span className="big" style={{ fontSize: next ? 22 : 27 }}>
            {next ? next.name : 'Nothing dated'}
          </span>
          <span className="sub">
            {next ? fmt(next.when) : 'every announced mint has been and gone'}
          </span>
        </article>
      </div>

      {raffles.length > 0 && (
        <>
          <p className="heading">Open right now</p>
          <div className="cards">
            {raffles.map(r => {
              const claim = r.kind === 'claim'
              const who = (r.communities ?? [])
                .map(id => communities.find(c => c.id === id)?.name).filter(Boolean)
              return (
                <article className="card raffle" key={r.id}>
                  <div><span className="code">{claim ? 'CLAIM' : 'RAFFLE'}</span></div>
                  <h3>{r.project}</h3>
                  <div className="tiers">
                    {r.tiers.map((t, i) => (
                      <span key={i}><b>{t.count === null ? '' : `${t.count} `}{t.label}</b> · {t.who}</span>
                    ))}
                  </div>
                  <span className="at">
                    {r.closesAt ? `closes ${fmt(r.closesAt)}` : 'open until it fills'}
                  </span>
                  {who.length > 0 && <span className="note" style={{ margin: 0 }}>For {who.join(' and ')}</span>}
                </article>
              )
            })}
          </div>
        </>
      )}

      <p className="heading">Still to come</p>
      <div className="cards">
        {ahead.map(r => (
          <article className={`card${r.state === 'live' ? ' is-live' : ''}`} key={r.code}>
            <div>
              <span className="code">{r.code}</span>{' '}
              <span className="tier">{r.total} {r.total === 1 ? 'spot' : 'spots'}</span>
            </div>
            <h3>{r.url ? <a href={r.url} target="_blank" rel="noopener">{r.name}</a> : r.name}</h3>
            <div>
              <span className={`big s-${r.state}`}>
                {r.state === 'live' ? 'MINTING NOW' : r.state === 'tbd' ? 'DATE TBD' : fmt(r.when)}
              </span>
            </div>
            <div className="tiers">
              {r.tiers.map((t, i) => (
                <span key={i}>
                  <b>{t.have} {t.tier}</b>
                </span>
              ))}
            </div>
            {r.note && <span className="sub">{r.note}</span>}
          </article>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <p className="heading">Already delivered</p>
          <p className="lede" style={{ marginBottom: 14, maxWidth: '62ch' }}>
            Mints this room has been given spots in and already minted. This is the part worth
            checking if you are deciding whether to join, or whether to hand this community an
            allocation — every one of these was drawn in the open and the winners are on chain.
          </p>
          <div className="cards">
            {done.map(r => (
              <article className="card" key={r.code} style={{ opacity: .92 }}>
                <div>
                  <span className="code">{r.code}</span>{' '}
                  <span className="tier">{r.total} {r.total === 1 ? 'spot' : 'spots'}</span>
                </div>
                <h3>{r.url ? <a href={r.url} target="_blank" rel="noopener">{r.name}</a> : r.name}</h3>
                <div>
                  <span className="big s-closed" style={{ fontSize: 20 }}>MINTED</span>{' '}
                  <span className="at">{fmt(r.endedAt ?? r.when)}</span>
                </div>
                <div className="tiers">
                  {r.tiers.map((t, i) => <span key={i}><b>{t.have} {t.tier}</b></span>)}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <p className="note" style={{ marginTop: 28 }}>
        Counts come from the same spot lists the board reads, so this page and a holder&rsquo;s own
        board can never disagree. A mint appears here only once its winners have been recorded —
        one that has been drawn but not written down would show nobody, so it is left off.
      </p>
    </main>
  )
}
