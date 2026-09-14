import config from '@/mintboard.config'
import Board from './Board'

export default function Page() {
  return (
    <main>
      <div className="wrap" style={{ paddingBottom: 0 }}>
        <h1>{config.name.toUpperCase()} <span>BOARD</span></h1>
        <p className="lede">{config.tagline} Nothing here is an advert: a mint only appears if
          {' '}<em>you</em> qualify for it — a spot you were drawn, or an asset you hold.</p>
      </div>
      <Board />
    </main>
  )
}
