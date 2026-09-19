import { allOutcomes, holdRate, claimRate } from '@/lib/spotOutcomes'

/**
 * What our room does with a spot it was given.
 *
 * This is the number partners compute about us anyway — Toadstools said out
 * loud they kept every wallet from every community that minted and would post
 * which room held and which was the jeet. Publishing it ourselves, with the
 * method attached, is the difference between evidence and a claim.
 *
 * Every figure here is checkable by the partner in seconds against wallets
 * they already have, which is the only reason it is worth showing at all.
 */
export default function Retention() {
  const rows = allOutcomes()
  if (!rows.length) return null

  return (
    <section className="wrap" style={{ paddingTop: 0, paddingBottom: 40 }}>
      <div className="pane" style={{ padding: 'clamp(24px, 4vw, 40px)' }}>
        <h2 style={{ marginTop: 0 }}>What our room does with a spot</h2>
        <p className="lede" style={{ marginBottom: 22 }}>
          Measured on chain, per collection, after the mint. Not a claim about how we feel
          about holding &mdash; a count of wallets anyone can check themselves.
        </p>

        <div style={{ display: 'grid', gap: 14 }}>
          {rows.map(o => {
            const hold = holdRate(o)
            const claim = claimRate(o)
            return (
              <article className="card" key={o.code} style={{ padding: 'clamp(16px, 3vw, 22px)' }}>
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 12,
                  alignItems: 'baseline', justifyContent: 'space-between',
                }}>
                  <h3 style={{ fontSize: 18, margin: 0 }}>{o.name}</h3>
                  {hold !== null && (
                    <span style={{
                      fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {hold}<span style={{ fontSize: 16, fontWeight: 600 }}>% still holding</span>
                    </span>
                  )}
                </div>

                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '6px 20px',
                  marginTop: 10, fontVariantNumeric: 'tabular-nums',
                }}>
                  <Stat n={o.spots} label="spots given" />
                  <Stat n={o.minted} label="claimed" />
                  <Stat n={o.held} label="still holding" />
                  <Stat n={o.sold} label="sold" />
                  {/* Never-claimed is its own number on purpose: somebody who missed a
                      six-hour window did not sell, and folding the two together would
                      report seven people as flippers who never touched the mint. */}
                  <Stat n={o.neverMinted} label="never claimed" />
                  {o.unreadable > 0 && <Stat n={o.unreadable} label="unreadable" />}
                </div>

                <p className="sub" style={{ margin: '12px 0 0', fontSize: 13 }}>
                  {claim !== null && <>{claim}% of the spots were used. </>}
                  {o.method}
                  {o.unreadable > 0 && (
                    <>{' '}<strong>
                      {o.unreadable} wallet{o.unreadable === 1 ? '' : 's'} could not be read,
                      and {o.unreadable === 1 ? 'is' : 'are'} counted as neither holding nor sold.
                    </strong></>
                  )}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span style={{ fontSize: 14 }}>
      <strong style={{ fontSize: 17 }}>{n}</strong> <span className="sub">{label}</span>
    </span>
  )
}
