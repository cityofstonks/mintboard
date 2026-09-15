import { select } from './db'
import config from '@/mintboard.config'

/**
 * Proving a wallet belongs to the person claiming it, without wallet-connect.
 *
 * The holder sends any transaction from the wallet to a published address.
 * Control of the key is the proof. It works from a hardware wallet, a phone,
 * a burner, anything that can send — where a browser signature flow needs a
 * browser extension and excludes exactly the careful people most likely to
 * hold the most.
 *
 * WHAT MAKES IT SOUND is the block floor. Only transactions after the claim
 * count. Without that, any wallet that had ever paid us would verify for
 * whoever claimed it next, and the busiest wallets would be the easiest to
 * steal.
 */

export const VERIFY_ADDRESS = (process.env.VERIFY_ADDRESS ?? '').trim().toLowerCase()
export const verifyReady = () => /^0x[0-9a-f]{40}$/.test(VERIFY_ADDRESS)

const rpcFor = (chain: string) => config.chains[chain]?.rpc ?? ''

async function rpc<T>(chain: string, method: string, params: unknown[]): Promise<T | null> {
  const url = rpcFor(chain)
  if (!url) return null
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(10_000), cache: 'no-store',
    })
    if (!r.ok) return null
    const text = await r.text()
    // A Cloudflare challenge is HTML, not JSON. Parsing it throws a
    // SyntaxError that reads like a bug rather than a closed door.
    if (text.startsWith('<')) return null
    const j = JSON.parse(text) as { result?: T; error?: unknown }
    if (j.error) return null
    return (j.result ?? null) as T | null
  } catch {
    return null
  }
}

export const blockNow = async (chain: string): Promise<number | null> => {
  const hex = await rpc<string>(chain, 'eth_blockNumber', [])
  return hex ? parseInt(hex, 16) : null
}

export type Found =
  | { ok: true; txHash: string }
  | { ok: false; why: 'not-yet' | 'unreadable' }

/**
 * Look for a transaction from `wallet` to the verify address, after `fromBlock`.
 *
 * Scans recent blocks rather than using an indexer, so it depends on nothing
 * but the RPC. The window is deliberately small — a claim is meant to be
 * completed in minutes, and a wide scan is both slow and a way to accidentally
 * match something ancient.
 */
export async function findProof(
  chain: string, wallet: string, fromBlock: number, maxBlocks = 3000,
): Promise<Found> {
  const tip = await blockNow(chain)
  if (tip === null) return { ok: false, why: 'unreadable' }
  const start = Math.max(fromBlock, tip - maxBlocks)
  const want = wallet.toLowerCase()
  const to = VERIFY_ADDRESS

  for (let n = tip; n >= start; n--) {
    const block = await rpc<{ transactions?: { from?: string; to?: string; hash?: string }[] }>(
      chain, 'eth_getBlockByNumber', ['0x' + n.toString(16), true])
    // A block we could not read is NOT a block with no match. Saying
    // "not found" here would tell somebody their proof had not arrived when
    // it might have, and they would send another.
    if (block === null) return { ok: false, why: 'unreadable' }
    for (const t of block.transactions ?? []) {
      if ((t.from ?? '').toLowerCase() === want && (t.to ?? '').toLowerCase() === to) {
        return { ok: true, txHash: t.hash ?? '' }
      }
    }
  }
  return { ok: false, why: 'not-yet' }
}

export interface Linked { wallet: string; verified_at: string }

export const walletsOf = async (discordUserId: string): Promise<Linked[]> =>
  await select<Linked[]>(
    `verified_wallets?discord_user_id=eq.${discordUserId}&unlinked_at=is.null&select=wallet,verified_at&order=verified_at.asc`) ?? []

/** Who already owns this wallet, if anybody. */
export const ownerOf = async (wallet: string): Promise<{ discord_user_id: string } | null> =>
  (await select<{ discord_user_id: string }[]>(
    `verified_wallets?wallet=eq.${wallet.toLowerCase()}&unlinked_at=is.null&limit=1`))?.[0] ?? null
