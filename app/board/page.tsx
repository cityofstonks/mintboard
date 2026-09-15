import config from '@/mintboard.config'
import Board from '../Board'

export default function Page() {
  return (
    <main>
      <div className="wrap" style={{ paddingBottom: 0 }}>
        <h1>{config.name.toUpperCase()} <span>BOARD</span></h1>
        <p className="lede">{config.tagline} Nothing here is an advert: a mint only appears if
          {' '}<em>you</em> qualify for it — a spot you were drawn, or an asset you hold.</p>
        <p className="note" style={{ marginTop: 10 }}>
          Running City of Stonks&rsquo; live data. Hold a key and you will see your own spots;
          hold none and you will see the doors that are open to everyone.
        </p>
      </div>
      <Board />
    </main>
  )
}
