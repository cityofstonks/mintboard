#!/usr/bin/env node
/**
 * Did our winners actually mint, and are they still holding?
 *
 *   node scripts/spot-outcomes.mjs            # every mint that can be measured
 *   node scripts/spot-outcomes.mjs --code TOAD --write
 *
 * THE POINT. Partners publish this about us whether we measure it or not.
 * Toadstools said out loud they kept every wallet from every community that
 * minted and would post which room had diamond hands and which was the jeet.
 * Knowing our own answer first is the difference between leading with a number
 * and being told one.
 *
 * WHAT IT NEEDS. A mint entry with `spotsList` (whose winners to check) and
 * enough to identify the collection:
 *   bitcoin — `marker`, the hex the project ends every inscription id with
 *   evm     — `mintContract`, and it reads balanceOf
 *
 * WHAT IT WILL NOT DO. Guess. A wallet the indexer would not answer for is
 * counted as unreadable and never as sold, because "we could not look" and
 * "they dumped it" are opposite claims and only one of them is defamatory.
 *
 * ON BITCOIN it can also tell never-minted from minted-and-sold, by asking
 * what inscriptions actually sat on the outputs a wallet spent. Plain dust
 * moving looks identical to an inscription leaving until you check, and that
 * check is the difference between a correct report and calling somebody a
 * jeet for consolidating their wallets.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const arg = (n, d = '') => { const i = argv.indexOf(`--${n}`); return i > -1 && argv[i + 1] ? argv[i + 1] : d }
const ONLY = arg('code').toUpperCase()
const WRITE = argv.includes('--write')

const mints = JSON.parse(readFileSync(new URL('../data/mints.json', import.meta.url), 'utf8'))
const spots = JSON.parse(readFileSync(new URL('../data/spots.json', import.meta.url), 'utf8'))

const UA = { 'User-Agent': 'cityofstonks-holdcheck/1.0' }
const INSC = /\/inscription\/([0-9a-f]{64}i[0-9]+)/gi
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function page(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45_000) })
      if (r.status === 404) return ''
      if (r.ok) return r.text()
    } catch {}
    await sleep(1200 * (i + 1))
  }
  return null
}
async function mempool(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`https://mempool.space/api${path}`, { signal: AbortSignal.timeout(40_000) })
      if (r.ok) return r.json()
    } catch {}
    await sleep(1200 * (i + 1))
  }
  return null
}
const idsIn = html => [...new Set([...html.matchAll(INSC)].map(m => m[1]))]

/** Bitcoin: holds / never minted / sold, each one established rather than assumed. */
async function scanBitcoin(addresses, marker, openedAt) {
  const out = { checked: 0, minted: 0, held: 0, sold: 0, neverMinted: 0, unreadable: 0 }
  for (const addr of addresses) {
    if (!/^bc1p/i.test(addr)) { out.unreadable++; continue }
    const html = await page(`https://ordinals.com/address/${addr}`)
    if (html === null) { out.unreadable++; console.log(`   ${addr.slice(0, 14)}… UNREADABLE`); continue }
    out.checked++
    const mine = idsIn(html).filter(id => new RegExp(`${marker}i[0-9]+$`, 'i').test(id))
    if (mine.length) { out.minted++; out.held++; console.log(`   ${addr.slice(0, 14)}… holds ${mine.length}`); await sleep(1100); continue }

    // Nothing now. Did one ever arrive? An inscription leaves on a spent
    // output, so check what those outputs actually carried before saying sold.
    const txs = await mempool(`/address/${addr}/txs`)
    if (txs === null) { out.unreadable++; out.checked--; console.log(`   ${addr.slice(0, 14)}… UNREADABLE (history)`); continue }
    let sold = false
    for (const t of txs) {
      const ts = t.status?.block_time ?? 0
      if (ts < openedAt) continue
      for (const v of t.vin ?? []) {
        if (v.prevout?.scriptpubkey_address !== addr || (v.prevout?.value ?? 0) > 1000) continue
        const o = await page(`https://ordinals.com/output/${v.txid}:${v.vout}`)
        await sleep(1000)
        if (o === null) continue                    // cannot prove it, so do not claim it
        if (idsIn(o).some(id => new RegExp(`${marker}i[0-9]+$`, 'i').test(id))) sold = true
      }
    }
    if (sold) { out.minted++; out.sold++; console.log(`   ${addr.slice(0, 14)}… MINTED THEN SOLD`) }
    else { out.neverMinted++; console.log(`   ${addr.slice(0, 14)}… never minted`) }
    await sleep(900)
  }
  return out
}

/** EVM: balanceOf only. Honest about what that can and cannot separate. */
async function scanEvm(addresses, contract, rpc) {
  const out = { checked: 0, minted: 0, held: 0, sold: 0, neverMinted: 0, unreadable: 0 }
  for (const addr of addresses) {
    let bal = null
    for (let i = 0; i < 3 && bal === null; i++) {
      try {
        const r = await fetch(rpc, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(25_000),
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: contract, data: '0x70a08231' + addr.slice(2).toLowerCase().padStart(64, '0') }, 'latest'] }),
        })
        const j = await r.json()
        if (typeof j.result === 'string' && j.result.length > 2) bal = parseInt(j.result, 16)
      } catch {}
      if (bal === null) await sleep(1200)
    }
    if (bal === null) { out.unreadable++; continue }
    out.checked++
    if (bal > 0) { out.minted++; out.held++ } else { out.neverMinted++ }
    await sleep(200)
  }
  // balanceOf cannot tell "sold what they minted" from "never minted", so it
  // claims neither. Only Bitcoin gets a sold figure until a Transfer replay
  // exists here, and a wrong sold number is worse than an absent one.
  return out
}

const results = []
for (const m of mints) {
  if (ONLY && m.code.toUpperCase() !== ONLY) continue
  const listId = m.spotsList ?? m.eligibility?.find(e => e.via === 'spots')?.list
  const list = listId ? spots[listId] : null
  if (!list?.wallets?.length) continue
  if (!m.marker && !m.mintContract) { console.log(`skip ${m.code}: no marker or mintContract, nothing to measure against`); continue }

  /*
   * A Bitcoin mint is not measured against the EVM wallets on the board. The
   * inscription goes to a taproot address, and the list carries that mapping
   * in `delivery`. Scanning the 0x addresses returned 17 unreadable and zero
   * of everything else, which is the shape of an answer that is really a
   * question.
   */
  const targets = m.marker
    ? [...new Set([...Object.values(list.delivery ?? {}), ...(list.deliveryExtra ?? [])])]
    : list.wallets
  if (!targets.length) { console.log(`skip ${m.code}: no delivery addresses recorded for a bitcoin mint`); continue }
  // Spots given is what the list says it awarded, not how many rows survived.
  const spotsGiven = Math.max(list.expected ?? 0, targets.length)

  console.log(`\n=== ${m.code} ${m.name} — ${spotsGiven} spots, ${targets.length} addresses to check ===`)
  const openedAt = Math.floor(Date.parse(m.startsAt ?? '2026-01-01') / 1000) - 3600
  const r = m.marker
    ? await scanBitcoin(targets, m.marker, openedAt)
    : await scanEvm(targets, m.mintContract, process.env[`RPC_${(m.chain ?? 'robinhood').toUpperCase()}`] ?? 'https://rpc.mainnet.chain.robinhood.com')

  results.push({
    code: m.code, name: m.name, spots: spotsGiven, ...r,
    chain: m.marker ? 'bitcoin' : (m.chain ?? 'robinhood'),
    scannedAt: new Date().toISOString(),
    method: m.marker
      ? `ordinals.com address pages, inscription ids ending ${m.marker}; spends checked against the outputs they moved`
      : `balanceOf against ${m.mintContract} — holds-now only, mint and purchase not separated`,
  })
  console.log(`   → minted ${r.minted} · held ${r.held} · sold ${r.sold} · never ${r.neverMinted} · unreadable ${r.unreadable}`)
}

if (WRITE && results.length) {
  const path = new URL('../data/spot-outcomes.json', import.meta.url)
  const prior = JSON.parse(readFileSync(path, 'utf8'))
  const merged = [...prior.filter(p => !results.some(r => r.code === p.code)), ...results]
    .sort((a, b) => a.code.localeCompare(b.code))
  writeFileSync(path, JSON.stringify(merged, null, 2) + '\n')
  console.log(`\nwrote ${results.length} result(s) into data/spot-outcomes.json`)
} else {
  console.log(`\n${results.length} result(s). Pass --write to save.`)
}

/*
 * --aggregate: fold the per-mint outcomes into the City of Stonks row that
 * the collections page actually shows.
 *
 * The SOLD / HOLD / GOLD card reads one row from holder-stats.json, so a
 * per-mint file nobody aggregates is a file nobody sees. Doing the fold here
 * rather than by hand means the next mint updates the headline number without
 * somebody remembering to add two figures together.
 *
 * `baseline` is the EVM history measured before this script existed — three
 * mints, scanned 15 September. It is kept as its own entry so the fold is
 * baseline + outcomes rather than an ever-growing number nobody can re-derive.
 */
if (argv.includes('--aggregate')) {
  const statsPath = new URL('../data/holder-stats.json', import.meta.url)
  const stats = JSON.parse(readFileSync(statsPath, 'utf8'))
  const outcomes = JSON.parse(readFileSync(new URL('../data/spot-outcomes.json', import.meta.url), 'utf8'))
  const row = stats.find(s => s.handle === 'city-of-stonks')
  if (!row) { console.error('no city-of-stonks row to aggregate into'); process.exit(1) }
  if (!row.baseline) {
    // First run: freeze what was already there as the baseline.
    row.baseline = { minted: row.minted, held: row.held, boughtMore: row.boughtMore, across: row.across ?? 0 }
    console.log(`froze baseline: ${row.baseline.minted} spots across ${row.baseline.across} mints`)
  }
  const b = row.baseline
  row.minted = b.minted + outcomes.reduce((a, o) => a + o.minted, 0)
  row.held = b.held + outcomes.reduce((a, o) => a + o.held, 0)
  row.boughtMore = b.boughtMore + outcomes.reduce((a, o) => a + (o.boughtMore ?? 0), 0)
  row.across = b.across + outcomes.length
  row.scannedAt = new Date().toISOString()
  writeFileSync(statsPath, JSON.stringify(stats, null, 2) + '\n')
  const pct = Math.round((row.held / row.minted) * 100)
  console.log(`city-of-stonks: ${row.minted} spots across ${row.across} mints · ${row.held} held (${pct}%) · ${row.boughtMore} gold`)
}
