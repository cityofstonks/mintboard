#!/usr/bin/env node
/**
 * How well did a community hold the allocation YOU gave them?
 *
 *   node scripts/holder-stats.mjs --handle pixelord --name "Pixelord" \
 *     --chain robinhood --contract 0xYOUR_TOKEN --cohort wallets.txt --write
 *
 * WHAT THIS IS NOT. It does not scan the partner's own collection. How their
 * own minters behaved tells you nothing about what happens when you hand
 * their room spots in yours — those are different people making a different
 * decision about a different token. Measuring the partner's collection was
 * the original mistake here and it produced cards that were confidently wrong
 * in both directions.
 *
 * THE COHORT is the wallets on that partner's allocation list (--cohort, one
 * address per line). THE TOKEN is yours (--contract). Of the cohort wallets
 * that actually minted, how many still hold one they minted.
 *
 * Holding means still owning a token they MINTED, not just owning any — a
 * wallet that sold its mint and bought two on secondary did sell what you
 * gave it, and `keysNow` carries the buying separately rather than letting it
 * cancel the sale.
 *
 * Wallets, never tokens: a room that minted fifty between three people must
 * not be able to look like fifty holders.
 *
 * NEEDS AN RPC THAT WILL TAKE IT. This walks the whole history in 20k-block
 * spans, which is thousands of requests against a long chain, and a public
 * endpoint will rate-limit or Cloudflare-challenge you part way through. Set
 * RPC_<CHAIN> to something with real allowance. A partial replay is the
 * dangerous failure here: it under-counts transfers and reports a community
 * as holding tokens it already sold, so check the run finished rather than
 * trusting the last line it printed.
 */
const arg = (n, d = '') => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d }
const WRITE = process.argv.includes('--write')
const HANDLE = arg('handle')
const NAME = arg('name', HANDLE)
const CHAIN = arg('chain', 'ethereum')
const CONTRACT = arg('contract').toLowerCase()
const FROM = Number(arg('from-block', '0'))
const COHORT_FILE = arg('cohort')
/**
 * --wallets <path> — write the per-wallet verdict as JSON.
 *
 * Needed to combine several scans into one honest row. Summing the counts
 * from three scans counts a wallet three times if it took all three spots,
 * and "288 wallets minted" would then be a bigger number than the cohort has
 * people. The union has to be taken over identities, not totals.
 */
const WALLETS_OUT = arg('wallets')
if (!HANDLE || !CONTRACT || !COHORT_FILE) {
  console.error('usage: --handle <x> --contract 0xYOURTOKEN --cohort wallets.txt [--chain ethereum] [--from-block N] [--write]')
  console.error('  --cohort is required: without the allocation list there is no community to measure.')
  process.exit(1)
}
const { readFileSync: _rf } = await import('node:fs')
const COHORT = new Set(_rf(COHORT_FILE, 'utf8').split(/\s+/)
  .map(a => a.trim().toLowerCase()).filter(a => /^0x[0-9a-f]{40}$/.test(a)))
if (!COHORT.size) { console.error(`No wallets read from ${COHORT_FILE}.`); process.exit(1) }

const RPCS = {
  ethereum: process.env.RPC_ETHEREUM ?? 'https://ethereum-rpc.publicnode.com',
  base: process.env.RPC_BASE ?? 'https://mainnet.base.org',
  robinhood: process.env.RPC_ROBINHOOD ?? 'https://rpc.mainnet.chain.robinhood.com',
}
const RPC = RPCS[CHAIN]
if (!RPC) { console.error(`no RPC for chain "${CHAIN}"`); process.exit(1) }

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ZERO = '0x0000000000000000000000000000000000000000'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function rpc(method, params) {
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(RPC, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      /*
       * A CHALLENGE PAGE IS NOT AN ANSWER.
       *
       * The endpoint sits behind Cloudflare, and once it decides you are
       * asking too often it stops replying in JSON and serves an HTML "just a
       * moment" page instead. `r.json()` then throws a SyntaxError about an
       * unexpected '<', which reads like a bug in the scanner rather than a
       * closed door, and the retry loop never sees it because the throw
       * happens before the error check below. Three scans died that way.
       *
       * Read the body once as text, and treat HTML as the rate limit it is.
       */
      const raw = await r.text()
      if (raw.startsWith('<') || /just a moment|cf-chl|challenge-platform/i.test(raw.slice(0, 600))) {
        if (i === 7) throw new Error(
          `${CHAIN} is serving a Cloudflare challenge instead of JSON — it is rate limiting this machine.\n`
          + `  Wait a few minutes, or set RPC_${CHAIN.toUpperCase()} to an endpoint with real allowance.\n`
          + `  This is not a finding about the collection.`)
        // Long backoff: a challenge clears on a timescale of minutes, not ms.
        await sleep(20_000 * (i + 1) + Math.random() * 4000)
        continue
      }
      let j
      try { j = JSON.parse(raw) }
      catch { if (i === 7) throw new Error(`${CHAIN} returned something that is not JSON: ${raw.slice(0, 120)}`)
              await sleep(2000 * (i + 1)); continue }
      if (j.error) {
        /*
         * A rate limit is not a failure, it is a "wait".
         *
         * Public endpoints answer 429 as a JSON-RPC error object rather than
         * an HTTP status, so throwing on any j.error killed a twenty-minute
         * scan outright the moment the node got busy — and running three
         * scans at once is exactly what makes it busy. Retryable errors back
         * off; only a genuinely bad request gives up.
         */
        const msg = JSON.stringify(j.error)
        const retryable = /429|Too Many Requests|rate.?limit|timeout|busy|try again|capacity/i.test(msg)
        if (!retryable || i === 7) throw new Error(msg.slice(0, 160))
        await sleep(1500 * (i + 1) + Math.random() * 800)
        continue
      }
      return j.result
    } catch (e) {
      if (i === 7) throw e
      await sleep(600 * (i + 1))
    }
  }
}

const addr = topic => '0x' + topic.slice(26).toLowerCase()
const num = hex => Number(BigInt(hex))

const latest = num(await rpc('eth_blockNumber', []))

/**
 * Where the contract starts.
 *
 * Ask for every mint in one query first. Measured against Robinhood's public
 * endpoint: a topic-filtered request spanning all 62 million blocks returns
 * 4,444 mint logs in a single call, while the same question asked in 100k
 * chunks took hundreds of sequential requests and had not finished. A filter
 * on topic1 keeps the result small no matter how wide the range, so width is
 * nearly free and narrowness is what costs.
 *
 * Only when a node refuses the span is it worth walking back in chunks, and
 * that walk looks for MINTS rather than for any transfer: an earlier version
 * stopped at the first trading it found, well above the mints, and reported a
 * collection with zero minters as though that were a finding.
 */
const MINT_TOPIC = '0x' + '0'.repeat(64)

async function mintLogs() {
  /*
   * Refusals are counted, not swallowed.
   *
   * Public Ethereum endpoints answer historical log queries with "Archive
   * requests require a personal token" — every probe errors, and treating a
   * refusal as an empty range turned "I cannot see" into "there is nothing
   * there". It reported two real 333- and 111-piece collections as having no
   * mints at all, which is a confident lie rather than a failure.
   */
  let refused = 0, asked = 0
  try {
    const all = await rpc('eth_getLogs', [{
      fromBlock: '0x0', toBlock: '0x' + latest.toString(16),
      address: CONTRACT, topics: [TRANSFER, MINT_TOPIC],
    }])
    asked++
    if (all?.length) return all
  } catch { refused++ }

  console.log('  node refused the full range, walking back in chunks')
  const out = []
  let lowest = null, quiet = 0
  for (let end = latest; end > 0; end -= 100000) {
    const from = Math.max(0, end - 99999)
    try {
      const part = await rpc('eth_getLogs', [{
        fromBlock: '0x' + from.toString(16), toBlock: '0x' + end.toString(16),
        address: CONTRACT, topics: [TRANSFER, MINT_TOPIC],
      }]) ?? []
      asked++
      if (part.length) { out.push(...part); lowest = from; quiet = 0 }
      else if (lowest !== null && ++quiet >= 8) break
    } catch { refused++ }
    await sleep(40)
  }
  if (!out.length && refused > 0 && refused >= asked) {
    throw new Error(
      `the ${CHAIN} endpoint refused every log query (${refused} of ${refused + asked}).\n`
      + `  Public nodes usually will not serve historical logs. Set RPC_${CHAIN.toUpperCase()} to an\n`
      + `  endpoint with archive access and run it again. This is not a finding about the collection.`)
  }
  return out
}

let mints
try {
  mints = await mintLogs()
} catch (e) {
  console.error(String(e.message ?? e))
  process.exit(1)
}
if (!mints.length) {
  console.error('Found no mints for that contract on this chain — check the address and --chain.')
  process.exit(1)
}
const firstMint = Math.min(...mints.map(l => num(l.blockNumber)))
const start = FROM > 0 ? FROM : firstMint
console.log(`${NAME} · ${CHAIN} · ${mints.length} mints · blocks ${start} → ${latest}`)

/** Logs in chunks, halving the range whenever a node refuses the span. */
async function logs(from, to, span = 20000) {
  // Whole range first, for the same reason as the mints above.
  try {
    const all = await rpc('eth_getLogs', [{
      fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16),
      address: CONTRACT, topics: [TRANSFER],
    }])
    if (all?.length) { console.log(`  ${all.length} transfers in one request`); return all }
  } catch { /* fall through to chunking */ }
  const out = []
  for (let s = from; s <= to;) {
    const e = Math.min(s + span - 1, to)
    try {
      const part = await rpc('eth_getLogs', [{
        fromBlock: '0x' + s.toString(16), toBlock: '0x' + e.toString(16),
        address: CONTRACT, topics: [TRANSFER],
      }])
      out.push(...part)
      s = e + 1
      if (out.length % 2000 < 50) console.log(`  ${out.length} transfers…`)
    } catch {
      if (span <= 500) { s = e + 1; continue }
      span = Math.floor(span / 2)
    }
    await sleep(60)
  }
  return out
}

const all = (await logs(start, latest))
  .filter(l => l.topics.length >= 4)
  .sort((a, b) => num(a.blockNumber) - num(b.blockNumber) || num(a.logIndex) - num(b.logIndex))
console.log(`${all.length} transfers`)

/*
 * Fetch only what can change an answer.
 *
 * The first version pulled a timestamp for every block and a receipt for every
 * transaction in the collection's whole history — tens of thousands of
 * sequential requests, and the unfiltered log query times out outright. Almost
 * none of it mattered: a timestamp is only needed for a block that holds a
 * mint or a minted token leaving its minter, and a transaction only needs
 * looking up when it moved a minted token out of the wallet that minted it.
 *
 * Everything else — every later resale between strangers — only affects the
 * running balance, which the logs already give for free.
 */
const mintBlocks = new Set(), outBlocks = new Set(), outTxs = new Set()
{
  const owned = new Map()   // wallet -> Set(tokenId), built as we walk
  for (const l of all) {
    const from = addr(l.topics[1]), to = addr(l.topics[2]), id = l.topics[3]
    if (from === ZERO) {
      if (!owned.has(to)) owned.set(to, new Set())
      owned.get(to).add(id)
      mintBlocks.add(l.blockNumber)
    } else if (owned.get(from)?.has(id)) {
      outBlocks.add(l.blockNumber)
      outTxs.add(l.transactionHash)
    }
  }
}
const wantBlocks = [...new Set([...mintBlocks, ...outBlocks])]
console.log(`  ${wantBlocks.length} blocks and ${outTxs.size} transactions actually matter`)

const ts = new Map()
for (let i = 0; i < wantBlocks.length; i += 8) {
  await Promise.all(wantBlocks.slice(i, i + 8).map(async b => {
    const blk = await rpc('eth_getBlockByNumber', [b, false])
    if (blk) ts.set(b, num(blk.timestamp))
  }))
  if (i % 320 === 0) console.log(`  ${ts.size}/${wantBlocks.length} block times…`)
}



const mintedBy = new Map()      // wallet -> Set(tokenId)
const currentOwner = new Map()  // tokenId -> wallet holding it now
const balance = new Map()       // wallet -> current count

for (const l of all) {
  const from = addr(l.topics[1]), to = addr(l.topics[2]), id = l.topics[3]
  const t = ts.get(l.blockNumber) ?? 0

  if (from === ZERO) {
    if (!mintedBy.has(to)) mintedBy.set(to, new Set())
    mintedBy.get(to).add(id)
  }
  // Logs arrive in order, so the last writer wins and this ends as the
  // current owner of every token.
  currentOwner.set(id, to === ZERO ? '' : to)

  if (from !== ZERO) balance.set(from, (balance.get(from) ?? 0) - 1)
  if (to !== ZERO) balance.set(to, (balance.get(to) ?? 0) + 1)
}

/*
 * Only the cohort. Everybody else who minted is somebody else's community and
 * has no business in this partner's number.
 */
let minted = 0, held = 0, boughtMore = 0, keysNow = 0
for (const w of COHORT) {
  const now = balance.get(w) ?? 0
  keysNow += now
  const tokens = mintedBy.get(w)
  if (!tokens?.size) continue          // took a spot, never minted
  minted++
  // Still owns at least one it minted. Rebuilt from the replay rather than
  // inferred from a balance, because a balance cannot tell a kept mint apart
  // from a replacement bought on secondary.
  if ([...tokens].some(id => (currentOwner.get(id) ?? '') === w)) held++
  // GOLD: holding more than they were ever handed. Counted per wallet because
  // a room's total can be one collector — 293 keys from 2 wallets reads as a
  // believing community until you count the wallets.
  if (now > tokens.size) boughtMore++
}

const minters = minted
const pct = n => minters ? Math.round((n / minters) * 100) : 0
console.log(`\n${NAME}: ${COHORT.size} on the allocation list, ${minted} of them minted`)
console.log(`  still holding ${String(held).padStart(5)}  ${pct(held)}%`)
console.log(`  sold          ${String(minted - held).padStart(5)}  ${pct(minted - held)}%`)
console.log(`  bought more   ${String(boughtMore).padStart(5)}  ${pct(boughtMore)}%   (GOLD)`)
console.log(`  in the room now ${String(keysNow).padStart(3)} token(s)`)

/*
 * Zero minters is never an answer. It means the scan started above the mints,
 * or the address or chain is wrong. Writing it would put a row of confident
 * zeros on a partner's card, which is worse than having no card at all.
 */
if (!minters) {
  console.error('\nNo mints found in the scanned range, so there is nothing to report.')
  console.error('Pass --from-block with a block at or below the first mint and run it again.')
  process.exit(1)
}

if (WALLETS_OUT) {
  const { writeFileSync: writeJson } = await import('node:fs')
  const per = {}
  for (const w of COHORT) {
    const tokens = mintedBy.get(w)
    if (!tokens?.size) continue
    per[w] = {
      held: [...tokens].some(id => (currentOwner.get(id) ?? '') === w),
      boughtMore: (balance.get(w) ?? 0) > tokens.size,
    }
  }
  writeJson(WALLETS_OUT, JSON.stringify(per))
  console.log(`  wrote ${Object.keys(per).length} wallet verdicts to ${WALLETS_OUT}`)
}

const row = {
  handle: HANDLE, collection: NAME, chain: CHAIN, contract: CONTRACT,
  minted, held, boughtMore, keysNow,

  scannedAt: new Date().toISOString(), fromBlock: start, toBlock: latest,
}
if (!WRITE) { console.log('\n--- dry run, nothing written. --write to save ---'); process.exit(0) }
const { readFileSync, writeFileSync } = await import('node:fs')
const path = new URL('../data/holder-stats.json', import.meta.url)
const list = JSON.parse(readFileSync(path, 'utf8'))
const at = list.findIndex(s => s.handle.toLowerCase() === HANDLE.toLowerCase())
if (at === -1) list.push(row); else list[at] = row
writeFileSync(path, JSON.stringify(list, null, 2) + '\n')
console.log('\nwrote data/holder-stats.json')
