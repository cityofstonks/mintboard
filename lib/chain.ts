import config from '@/mintboard.config'

const pad = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')
const BALANCE_OF = '0x70a08231'

/**
 * One eth_call, or null.
 *
 * null means UNREADABLE, never zero. balanceOf on a live contract always
 * returns a 32-byte word, so an empty answer is an endpoint having a bad
 * minute — and treating that as "holds none" is how a board tells a holder
 * they do not qualify for something they do qualify for. Every caller here
 * has to keep the two apart.
 */
async function ethCall(chain: string, to: string, data: string): Promise<string | null> {
  const rpc = config.chains[chain]?.rpc
  if (!rpc) return null
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!r.ok) return null
    const j = await r.json() as { result?: string; error?: unknown }
    if (j.error || typeof j.result !== 'string' || j.result === '0x') return null
    return j.result
  } catch {
    return null
  }
}

export async function balanceOf(chain: string, contract: string, address: string): Promise<number | null> {
  const res = await ethCall(chain, contract, BALANCE_OF + pad(address))
  if (res === null) return null
  const n = Number(BigInt(res))
  return Number.isFinite(n) ? n : null
}

/**
 * How many of each configured collection a wallet holds, and which ones could
 * not be read. The second half is the whole reason this returns an object.
 */
export async function holdings(address: string): Promise<{
  held: Map<string, number>
  unreachable: string[]
}> {
  const held = new Map<string, number>()
  const unreachable: string[] = []
  await Promise.all(config.collections.map(async col => {
    const n = await balanceOf(col.chain, col.contract, address)
    if (n === null) { unreachable.push(col.id); return }
    if (n > 0) held.set(col.id, n)
  }))
  return { held, unreachable }
}

/** null when the chain did not answer — never 0, for the reason above. */
export async function gateBalance(address: string): Promise<number | null> {
  if (!config.gate) return null
  return balanceOf(config.gate.chain, config.gate.contract, address)
}

export const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim())
