# Mintboard

**A mint board for NFT communities.** It shows each wallet only the mints it
actually qualifies for, plus the raffles it can still enter — and nothing else.

Point it at your chains and collections, drop your raffles into a JSON file,
deploy to Vercel. No database, no backend to run, no wallet connection.

---

## The one rule

**A mint appears only if the wallet reading it qualifies.**

Not on the list for a drop? That drop is not on your board. This is the whole
difference between a board and an advert, and everything below follows from it:

- A wallet is told **why** it qualifies — a spot it was drawn, or an asset it holds.
- Times shown are **that wallet's window**, not the public one. A guaranteed
  holder shown the public time turns up two hours late.
- A chain that does not answer produces a **warning, never a "no"**. Telling
  somebody they do not qualify because an RPC blinked is the one wrong answer
  that costs them a mint.
- Gaps in *your* records stay with you. A holder cannot act on them.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR-NAME/mintboard)

Or locally:

```bash
git clone https://github.com/YOUR-NAME/mintboard
cd mintboard
npm install
npm run dev          # http://localhost:3000
```

It runs out of the box with sample data and a real Ethereum read, so you can
see it working before changing anything.

## Setting it up

### 1. `mintboard.config.ts` — who you are

```ts
name: 'Your Project',
accent: '#CCFF00',              // one colour carries the page
discordInvite: 'https://discord.gg/…',

// Optional. Leave null and anyone can check any wallet.
gate: { chain: 'ethereum', contract: '0x…', min: 5, label: 'Key Masters' },

chains: { ethereum: { rpc: process.env.RPC_ETHEREUM ?? '…' } },

collections: [
  { id: 'bayc', name: 'Bored Ape Yacht Club', chain: 'ethereum', contract: '0x…' },
],
```

The board only ever calls `balanceOf` against the collections you list. It
never scans a wallet, so **nobody can airdrop their way onto your board**.

Set `RPC_ETHEREUM`, `RPC_BASE` (etc.) in Vercel's environment variables to use
a paid endpoint. Add any EVM chain by adding a key to `chains`.

### 2. `data/mints.json` — what is coming up

```jsonc
{
  "code": "DEMO",
  "name": "Demo Drop",
  "eligibility": [
    { "via": "spots", "list": "demo-gtd", "tier": "GTD" },   // you won a spot
    { "via": "holds", "collection": "bayc", "min": 1, "tier": "HOLDER" }  // you hold something
  ],
  "startsAt": "2027-01-20T15:00:00Z",
  "phases": [
    { "tier": "GTD",    "opensAt": "…", "price": null,     "limit": 1 },
    { "tier": "PUBLIC", "opensAt": "…", "price": "0.0059", "limit": 99 }
  ]
}
```

Any rule matching is enough. `price: null` means free; omitting it means
unknown. **`startsAt: null` is a real answer** — the board shows `TBD` rather
than inventing a date, because most projects announce a mint long before they
schedule it.

### 3. `data/spots.json` — who won

```jsonc
"demo-gtd": {
  "source": "Demo Drop, guaranteed tier, drawn 2026-01-01",
  "expected": 25,                       // awarded, when more than you hold addresses for
  "wallets": ["0x…"],
  "needs": {                            // must still act, or the spot lapses
    "message": "You have not filed your X comment yet.",
    "wallets": ["0x…"]
  },
  "delivery": { "0x…": "bc1p…" }        // where it goes, for non-EVM mints
}
```

**Wallets only. Never names.** These files ship in your deployment; a file
pairing a wallet with the person who gave it is a map nobody agreed to publish.
Delivery addresses are **masked** in the UI — the board accepts any address
typed into it and asks for no signature, so printing one in full would hand
anyone a map from one of a person's wallets to another.

A row carrying an outstanding action sorts above everything else. It is the
only row that expires.

### 4. `data/raffles.json` — what is open now

```jsonc
{
  "id": "raffle-1",
  "project": "Demo Drop",
  "closesAt": "2027-01-18T20:00:00Z",
  "tiers": [
    { "label": "Guaranteed", "count": 10, "who": "holders of 5+", "drawn": true },
    { "label": "First come",  "count": null, "who": "every holder", "drawn": false }
  ],
  "enterUrl": "https://discord.com/channels/…"
}
```

`count: null` means uncapped — a blanket allowlist rather than a draw. Printing
a number beside one would invent a competition that does not exist.

Raffles **drop off by themselves** when `closesAt` passes. A closed box stops
taking entries, so a card still offering a way in spends a click and returns a
page that will not count anybody.

## Embedding it in your own site

```html
<iframe src="https://your-board.vercel.app/embed"
        style="width:100%;height:900px;border:0" loading="lazy"></iframe>
```

`/embed` drops the page heading and padding and is the only route that allows
framing. Everything else stays `DENY`.

## API

| Route | Gated | Returns |
|---|---|---|
| `GET /api/raffles` | never | open raffles — nothing per-wallet, so nothing to leak |
| `GET /api/board?address=0x…` | by `gate` | rows, holdings, warnings, raffles |
| `GET /api/board/ics?address=0x…` | same as board | a calendar file, one event per dated mint, 15-minute alarm |

Reading about an open raffle needs no wallet and no token. **Entering** one
might. Asking for an address before showing what is open gets the order
backwards, which is why `/api/raffles` is never gated.

The calendar file leaves undated mints out entirely: an event at an invented
time looks like knowledge.

## The admin page

`/admin` lets somebody who is not a developer add, edit and remove raffles.

Set two environment variables in your Vercel project:

| Variable | What it does |
|---|---|
| `ADMIN_PASSWORD` | **Required.** Without it the admin is switched off entirely. |
| `ADMIN_SECRET` | Optional. Signs the session cookie; derived from the password if unset. |

### Saving from a deployed site

A deployed filesystem is **read-only**, so the admin cannot rewrite
`data/raffles.json` in place the way it can on your laptop. Rather than drag a
database into a tool whose whole pitch is "clone it and deploy", writes go back
to GitHub:

| Variable | Example |
|---|---|
| `GITHUB_TOKEN` | a fine-grained token with **Contents: read and write** on this repo only |
| `GITHUB_REPO` | `your-name/mintboard` |
| `GITHUB_BRANCH` | `main` (default) |

Each save is a commit, so the history of who changed which raffle is kept for
you, and undoing a bad edit is `git revert` rather than an argument about what
it used to say. Two people editing at once collide loudly instead of one
silently discarding the other.

Without a token the board still works perfectly — the admin simply says it
cannot save, rather than pretending to and losing the edit. Locally
(`npm run dev`) it writes the file directly and you commit when you are happy.

## Running raffles

Mintboard displays; it does not draw. Post your raffle wherever your community
already lives, add the entry to `data/raffles.json` with a link straight to the
message, and add the winners to `data/spots.json` when it closes. Both files
are editable from the GitHub web UI — which matters, because the person who
runs your raffles is usually not the person who knows how to run `git`.

## Licence

MIT. Take it, rename it, make it yours.
