import type { Metadata } from 'next'
import Checker from './Checker'

export const metadata: Metadata = {
  title: 'Check an ordinal address',
  description: 'Confirm a Bitcoin taproot address before an inscription is sent to it.',
}

export default function Page() {
  return (
    <main className="wrap">
      <h1>CHECK AN <span>ORDINAL ADDRESS</span></h1>
      <p className="lede" style={{ maxWidth: '62ch' }}>
        Paste the address you would give a Bitcoin mint. This confirms it is taproot and that
        there is no typo in it — the two ways an inscription gets lost for good.
      </p>

      <Checker />

      <div className="cards" style={{ marginTop: 30 }}>
        <article className="card">
          <div className="code">BC1P, NOT BC1Q</div>
          <p className="sub" style={{ marginTop: 8 }}>
            Only a taproot address can hold an inscription. A <code>bc1q</code> address is
            perfectly good Bitcoin and will accept the transaction — the inscription inside it is
            simply gone. Most wallets offer both; look for the one starting <code>bc1p</code>.
          </p>
        </article>
        <article className="card">
          <div className="code">THE CHECKSUM</div>
          <p className="sub" style={{ marginTop: 8 }}>
            Bitcoin addresses carry their own error detection, which is why a single mistyped
            character is caught here rather than on chain. If this page says the checksum fails,
            re-copy the address rather than hunting for the wrong letter.
          </p>
        </article>
        <article className="card">
          <div className="code">WHAT THIS DOES NOT DO</div>
          <p className="sub" style={{ marginTop: 8 }}>
            It does not list what an address holds. Every free ordinals indexer now requires a
            key, and reporting &ldquo;no inscriptions&rdquo; when we simply could not look would be
            worse than saying nothing.
          </p>
        </article>
      </div>

      <p className="note" style={{ marginTop: 28 }}>
        Holders can file their delivery address with City Bot instead — it runs the same check and
        ties the address to the wallet you have already proven, so we know whose it is.
      </p>
    </main>
  )
}
