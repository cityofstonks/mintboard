/**
 * Proving somebody owns a collection before letting them edit it.
 *
 * TWO ROUTES, AND THE SECOND IS NOT A FALLBACK FOR A FAILED FIRST.
 *
 *   opensea-x   OpenSea already records a twitter_username for most
 *               collections. If the signed-in X handle matches it, the person
 *               editing is the account the collection itself points at. No
 *               work for an operator, and no judgement call.
 *
 *   operator    Everything else. Not every collection has an OpenSea record —
 *               CannaCats' contract answers 401 while another on the same
 *               chain resolves — and a collection OpenSea cannot see is not
 *               evidence of anything either way. Those go to a person.
 *
 * WHAT MUST NEVER HAPPEN is the two collapsing: a lookup that fails for a
 * network reason must not read as "no match", and "no match" must not read as
 * "denied forever". The first would hand ownership to whoever asked while
 * OpenSea was down; the second would strand every legitimate owner whose
 * collection is not indexed.
 */

export type Verdict =
  | { grant: true; via: 'opensea-x'; handle: string }
  | { grant: false; reason: 'mismatch'; theirs: string; onFile: string }
  | { grant: false; reason: 'no-record' }
  | { grant: false; reason: 'unreachable' }

const norm = (s: string) => (s ?? '').trim().toLowerCase().replace(/^@/, '')

/**
 * Decide from an already-fetched OpenSea record.
 *
 * Separated from the fetch so the rule is testable without a network, which
 * is the only way to pin the distinction between "no match" and "could not
 * look".
 */
export function judge(signedInHandle: string, openSea: { twitter_username?: string | null } | null): Verdict {
  const theirs = norm(signedInHandle)
  if (!theirs) return { grant: false, reason: 'no-record' }
  // null means the lookup itself failed. An empty/absent username means the
  // lookup worked and the collection simply has no X account on file.
  if (openSea === null) return { grant: false, reason: 'unreachable' }
  const onFile = norm(openSea.twitter_username ?? '')
  if (!onFile) return { grant: false, reason: 'no-record' }
  if (onFile === theirs) return { grant: true, via: 'opensea-x', handle: theirs }
  return { grant: false, reason: 'mismatch', theirs, onFile }
}

/**
 * Ask OpenSea about a collection.
 *
 * Returns null for ANY failure — that is what makes 'unreachable' reachable
 * above. Resolving a failure to an empty record would quietly turn every
 * outage into "this collection has no X account", and from there into a
 * claim queue full of things that should have been automatic.
 */
export async function lookupCollection(slug: string): Promise<{
  twitter_username?: string | null
  name?: string
  contracts?: { address: string; chain: string }[]
  total_supply?: number
} | null> {
  const clean = (slug ?? '').trim().replace(/^https?:\/\/(?:www\.)?opensea\.io\/collection\//, '').replace(/\/.*$/, '')
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(clean)) return null
  try {
    const r = await fetch(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(clean)}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/** What the person is told. Never leaks more than they asked about. */
export function explain(v: Verdict): string {
  if (v.grant) return `Verified — OpenSea has @${v.handle} on this collection.`
  if (v.reason === 'mismatch') {
    return `OpenSea has @${v.onFile} on this collection, not @${v.theirs}. `
      + 'If it is yours, send a claim and an operator will look.'
  }
  if (v.reason === 'no-record') {
    return 'OpenSea has no X account on file for this collection, so it cannot be checked automatically. '
      + 'Send a claim and an operator will look.'
  }
  return 'Could not reach OpenSea just now, so this cannot be checked automatically. '
    + 'Try again shortly, or send a claim.'
}
