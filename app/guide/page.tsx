import config from '@/mintboard.config'
import type { Metadata } from 'next'
import Snippet from './Snippet'

export const metadata: Metadata = {
  title: 'Guide — Mintboard',
  description: 'Put a mint board on your own site, for your own collection holders.',
}

const EMBED = `<iframe
  src="https://YOUR-BOARD.vercel.app/embed"
  id="mintboard"
  style="width:100%;height:900px;border:0"
  loading="lazy"></iframe>

<script>
  // Optional: the board tells you how tall it is, so there is no scrollbar
  // and no slab of dead space underneath it.
  addEventListener('message', function (e) {
    if (e.data && e.data.type === 'mintboard:height') {
      document.getElementById('mintboard').style.height = e.data.height + 'px'
    }
  })
</script>`

const MINT = `{
  "code": "FURN",
  "name": "The Furnace",
  "eligibility": [
    { "via": "spots", "list": "furnace-gtd", "tier": "GTD" },
    { "via": "holds", "collection": "bayc", "min": 1, "tier": "HOLDER" }
  ],
  "startsAt": null,
  "phases": [
    { "tier": "GTD",    "opensAt": "2027-01-20T15:00:00Z", "price": null,     "limit": 1 },
    { "tier": "PUBLIC", "opensAt": "2027-01-20T19:00:00Z", "price": "0.0059", "limit": 99 }
  ],
  "note": "3,232 on Robinhood Chain. Price and date TBA."
}`

const SPOTS = `"furnace-gtd": {
  "source": "The Furnace, guaranteed tier, drawn 2026-09-15",
  "expected": 10,
  "wallets": ["0xabc…", "0xdef…"],
  "needs": {
    "message": "You have not filed your X comment yet.",
    "wallets": ["0xabc…"]
  }
}`

const CONFIG = `name: 'Your Project',
accent: '#CCFF00',

// Optional. Leave null and anyone can check any wallet.
gate: { chain: 'ethereum', contract: '0x…', min: 5, label: 'Key Masters' },

collections: [
  { id: 'bayc', name: 'Bored Ape Yacht Club',
    chain: 'ethereum', contract: '0xbc4ca0…f13d' },
],`

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ margin: '0 0 34px' }}>
      <h2 style={{ fontSize: 19, margin: '0 0 8px', letterSpacing: '-.01em' }}>
        <span style={{ color: 'var(--accent)' }}>{n}.</span> {title}
      </h2>
      <div className="lede" style={{ maxWidth: '72ch' }}>{children}</div>
    </section>
  )
}

export default function Guide() {
  return (
    <main className="wrap" style={{ maxWidth: 880 }}>
      <p className="note"><a href="/board">← back to the board</a></p>
      <h1>THE <span>GUIDE</span></h1>
      <p className="lede" style={{ marginBottom: 28 }}>
        How to put a mint board in front of your own holders — on your own site, under your own
        name, showing each wallet only what it can actually enter.
      </p>

      <div className="warn" style={{ margin: '0 0 32px' }}>
        <strong>The one rule everything follows from.</strong> A mint appears only if the wallet
        reading it qualifies. Not on the list for a drop? That drop is not on their board. It is
        the difference between a board and an advert, and it is why holders trust it enough to
        check it before a mint instead of asking in your chat.
      </div>

      <Step n={1} title="Get your own copy">
        <p>
          Mintboard is a public repository. Fork it, or click the deploy button in the README and
          Vercel will make you a copy with its own address in about a minute. You do not need a
          server, a database, or a wallet connection — it reads public chain data and nothing else.
        </p>
        <p className="note">Free tier is fine. A board serving a few thousand holders costs nothing to run.</p>
      </Step>

      <Step n={2} title="Tell it who you are">
        <p>
          One file: <code>mintboard.config.ts</code>. Your name, your accent colour, the chains you
          read, and the collections that count.
        </p>
        <Snippet code={CONFIG} label="mintboard.config.ts" />
        <p>
          <strong>The gate is optional.</strong> Leave it <code>null</code> and anyone can check any
          wallet. Set it and a wallet must hold something of yours before the board tells it what it
          has won — useful if your spots are a holder benefit you would rather not advertise to
          people who cannot use them.
        </p>
        <p>
          The board only ever calls <code>balanceOf</code> against the collections you list, so
          nobody can airdrop their way onto it.
        </p>
      </Step>

      <Step n={3} title="Add what is coming up">
        <p>
          <code>data/mints.json</code>. Each mint lists the ways to qualify; any one matching is
          enough. <code>spots</code> means a wallet is on a list you drew. <code>holds</code> means
          it holds one of your configured collections, read live on every page load.
        </p>
        <Snippet code={MINT} label="data/mints.json" />
        <p>
          <strong>Phases are the bit worth getting right.</strong> A mint is rarely one time — it is
          a run of windows at different prices with different caps. Give it the project&apos;s real
          schedule and each holder sees <em>their</em> window counting down, not the public one. A
          guaranteed holder shown the public time turns up two hours late.
        </p>
        <p>
          <strong><code>startsAt: null</code> is a real answer.</strong> Most projects announce a
          mint long before they schedule it. The board shows <code>TBD</code> rather than inventing
          a date, and the mint still appears for everyone holding a spot on it.
        </p>
      </Step>

      <Step n={4} title="Add who won">
        <p>
          <code>data/spots.json</code>, one entry per list your mints refer to. Wallets only.
        </p>
        <Snippet code={SPOTS} label="data/spots.json" />
        <p>
          <strong>Never put names in this file.</strong> It ships inside your deployment, and a
          file pairing a wallet with the person who gave it is a map nobody agreed to publish. The
          board needs the address and nothing else.
        </p>
        <p>
          <code>needs</code> is the half nobody else builds: winners who must still do something —
          file a comment, post a taproot address — or the spot lapses. A row carrying one sorts
          above everything else on that wallet&apos;s board, because it is the only row that expires.
        </p>
      </Step>

      <Step n={5} title="Run your raffles from the admin page">
        <p>
          Set <code>ADMIN_PASSWORD</code> in your project settings and <code>/admin</code> switches
          on. Whoever runs your raffles can add, edit and remove them without touching JSON or
          knowing what a commit is.
        </p>
        <p>
          Add <code>GITHUB_TOKEN</code> and <code>GITHUB_REPO</code> too and saves are written back
          to your repository as commits — so the history of who changed which raffle is kept for
          you, and undoing a bad edit is a revert rather than an argument about what it used to say.
          Without a token the board still works; the admin simply tells you it cannot save instead
          of pretending to.
        </p>
        <p className="note">
          Closed raffles drop off the board on their own. You never have to remember to tidy up.
        </p>
      </Step>

      <Step n={6} title="Put it on your own site">
        <p>
          Paste this wherever you want the board to appear. Swap in your own address.
        </p>
        <Snippet code={EMBED} label="your site" />
        <p>
          <code>/embed</code> is the same board with the heading and page padding removed, and it is
          the only route that allows framing — everything else stays <code>DENY</code>. The script
          is optional; without it the board sits at whatever height you set.
        </p>
      </Step>

      <Step n={7} title="See what a partner's holders actually did">
        <p>
          Before you spend your community&apos;s attention on a project, it is worth knowing what
          happened the last time somebody did. Run the scanner against their contract and the
          answer goes on their card in <code>/partners</code>:
        </p>
        <Snippet code={'node scripts/holder-stats.mjs --handle TheirHandle \\\n  --chain ethereum --contract 0x… --window 24 --write'} label="terminal" />
        <p>
          Three numbers — <strong>held</strong>, <strong>sold</strong>, <strong>bought more</strong> —
          as shares of the wallets that minted, so one whale minting fifty counts once rather than
          fifty times.
        </p>
        <p>
          <strong>Moving a token to your own cold wallet is not a flip.</strong> It looks identical
          to a sale in the logs; what separates them is that moving your own token is a direct call
          to the collection, while a sale goes through a marketplace. Getting that wrong would
          label the most careful holders in a community as flippers.
        </p>
      </Step>

      <Step n={8} title="What your holders get">
        <p>
          They paste an address — no wallet connection, nothing signed, nothing stored — and see
          the mints they hold a spot on, which tier, <strong>why</strong> they qualify, and when
          their own window opens. They can add the dated ones to a real calendar with an alarm
          fifteen minutes before each.
        </p>
        <p>
          People with no address pasted still see every raffle that is open, because reading about
          an open door is not walking through it.
        </p>
        <p>
          And if a chain does not answer, they get a warning rather than a &ldquo;no&rdquo;. Telling
          somebody they do not qualify because an endpoint blinked is the one wrong answer that
          costs them a mint.
        </p>
      </Step>

      <h2 style={{ fontSize: 19, margin: '40px 0 8px' }}>The API, if you want to build on it</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Route', 'Gated', 'Returns'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--edge)', color: 'var(--faint)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['GET /api/raffles', 'never', 'every open raffle — nothing per-wallet, so nothing to leak'],
              ['GET /api/board?address=0x…', 'by your gate', 'rows, holdings, warnings, raffles'],
              ['GET /api/board/ics?address=0x…', 'same as the board', 'a calendar file, one event per dated mint'],
            ].map(([a, b, c]) => (
              <tr key={a}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--edge)', color: 'var(--accent)', whiteSpace: 'nowrap' }}><code>{a}</code></td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--edge)', color: 'var(--muted)' }}>{b}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--edge)', color: 'var(--muted)' }}>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="note" style={{ marginTop: 30 }}>
        Mintboard is MIT licensed. Rename it, restyle it, make it yours — and if you break
        something, it is a single repository you can read end to end.
      </p>
      <p className="note"><a href="/board">← back to the board</a> · <a href={config.discordInvite}>community</a></p>
    </main>
  )
}
