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
 * WHAT MAKES IT SOUND is the block floor. Only transactions mined after the
 * claim was opened count. Without that, any wallet that had ever paid us
 * would verify for whoever claimed it next, and the busiest wallets would be
 * the easiest to steal.
 *
 * THE HOLDER SUPPLIES THE HASH rather than us hunting for it. This started as
 * a backwards block scan and that cannot work here: Robinhood Chain mines ten
 * blocks a second, so a thirty-minute window is eighteen thousand blocks and
 * eighteen thousand RPC calls. Asking for the hash makes it one call, and one
 * call is also one thing that can fail rather than eighteen thousand.
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
  | { ok: true; txHash: string; block: number }
  | { ok: false; why: 'unreadable' | 'not-found' | 'pending' | 'wrong-sender' | 'wrong-target' | 'too-early' }

interface Tx { from?: string; to?: string; hash?: string; blockNumber?: string | null }

/**
 * Check one transaction, named by the person claiming the wallet.
 *
 * Every reason to say no is its own answer. "We could not reach the chain"
 * and "that transaction came from a different wallet" are completely
 * different problems for the person reading the reply, and collapsing them
 * into a single no is how somebody ends up sending a second transaction to
 * fix something that was never wrong.
 */
export async function checkProof(
  chain: string, wallet: string, txHash: string, fromBlock: number,
): Promise<Found> {
  const hash = txHash.trim().toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(hash)) return { ok: false, why: 'not-found' }

  const tx = await rpc<Tx | null>(chain, 'eth_getTransactionByHash', [hash])
  // null means the read failed OR no such transaction, and the two are not
  // the same thing. A second call tells them apart: if the chain answers with
  // a block height, it is reachable, so a null transaction really is absent.
  if (tx === null) {
    return { ok: false, why: (await blockNow(chain)) === null ? 'unreadable' : 'not-found' }
  }

  if (!tx.blockNumber) return { ok: false, why: 'pending' }
  if ((tx.from ?? '').toLowerCase() !== wallet.toLowerCase()) return { ok: false, why: 'wrong-sender' }
  if ((tx.to ?? '').toLowerCase() !== VERIFY_ADDRESS) return { ok: false, why: 'wrong-target' }

  const block = parseInt(tx.blockNumber, 16)
  // The floor. A transaction mined before the claim was opened proves the
  // wallet acted, but not that the person claiming it now is the one who
  // acted — it could be anyone who can read a block explorer.
  if (!Number.isFinite(block) || block < fromBlock) return { ok: false, why: 'too-early' }

  return { ok: true, txHash: hash, block }
}

export interface Linked { wallet: string; verified_at: string }

export const walletsOf = async (discordUserId: string): Promise<Linked[]> =>
  await select<Linked[]>(
    `verified_wallets?discord_user_id=eq.${discordUserId}&unlinked_at=is.null&select=wallet,verified_at&order=verified_at.asc`) ?? []

/** Who already owns this wallet, if anybody. */
export const ownerOf = async (wallet: string): Promise<{ discord_user_id: string } | null> =>
  (await select<{ discord_user_id: string }[]>(
    `verified_wallets?wallet=eq.${wallet.toLowerCase()}&unlinked_at=is.null&limit=1`))?.[0] ?? null
