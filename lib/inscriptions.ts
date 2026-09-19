/**
 * Reading what a Bitcoin address actually holds, now that the APIs are gone.
 *
 * Separate from ordinals.ts on purpose: that file is about DELIVERY addresses
 * somebody declared, this one is about what is provably on chain. Declared and
 * observed are different kinds of fact and the codebase already keeps them apart.
 *
 * Hiro returns 410, Ordiscan and Unisat want a key, Magic Eden was 503. What is
 * still up is ordinals.com — the ord explorer itself, the canonical indexer
 * rather than somebody's cache of one. It serves HTML and disables its JSON
 * API, so this parses the page. Ugly, and it works.
 *
 * Collections that mark their own ids can be counted with no collection index
 * at all. Toadstools inscribed every one ending `70ad` — TOAD, in the usual
 * way — and since an inscription ID *is* its genesis txid, a string test
 * identifies them exactly.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: a page that would not load is `null`,
 * never an empty list. Reporting "holds none" because a request timed out
 * would tell somebody their community sold when it did not.
 */

const UA = { 'User-Agent': 'cityofstonks-holdcheck/1.0' }
const ID = /\/inscription\/([0-9a-f]{64}i[0-9]+)/gi

async function page(url: string, tries = 3): Promise<string | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45_000), cache: 'no-store' })
      if (r.status === 404) return ''            // genuinely nothing there
      if (r.ok) return r.text()
    } catch { /* fall through to the retry */ }
    await new Promise(s => setTimeout(s, 1200 * (i + 1)))
  }
  return null
}

const idsIn = (html: string): string[] =>
  [...new Set([...html.matchAll(ID)].map(m => m[1]))]

/** Every inscription id on an address, or null if the explorer would not answer. */
export async function inscriptionsOf(address: string): Promise<string[] | null> {
  const html = await page(`https://ordinals.com/address/${address}`)
  return html === null ? null : idsIn(html)
}

/** Every inscription sitting on one output. Proves what a spend actually moved. */
export async function inscriptionsOnOutput(txid: string, vout: number): Promise<string[] | null> {
  const html = await page(`https://ordinals.com/output/${txid}:${vout}`)
  return html === null ? null : idsIn(html)
}

/** Does an inscription belong to a collection that marks its own ids? */
export const matchesMarker = (id: string, marker: string): boolean =>
  new RegExp(`${marker}i[0-9]+$`, 'i').test(id)

export const ofCollection = (ids: string[], marker: string): string[] =>
  ids.filter(i => matchesMarker(i, marker))
