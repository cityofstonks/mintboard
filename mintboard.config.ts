/**
 * The only file most communities need to edit.
 *
 * Everything below describes YOUR project: what you are called, which chains
 * you read, which collections count, and whether the board is gated behind
 * holding something. The mints, spot lists and raffles live in data/*.json so
 * they can be edited from the GitHub web UI without a checkout — that matters,
 * because the person who runs your raffles is usually not the person who
 * knows how to run `git`.
 */
export interface Chain { rpc: string }

export interface Collection {
  /** Short id you reference from data/mints.json. */
  id: string
  name: string
  chain: string
  contract: string
}

export interface BoardConfig {
  name: string
  tagline: string
  /** Any CSS colour. One accent carries the whole page. */
  accent: string
  /** Where "enter the raffle" sends people. */
  discordInvite: string
  /**
   * Optional holder gate on the wallet checker.
   *
   * Leave null and anybody can check any wallet. Set it and a wallet must
   * hold `min` of `contract` before it is told what it has won. The raffles
   * list is NEVER gated — reading about an open door is not walking through
   * it, and asking for a wallet before showing what is open gets the order
   * backwards.
   */
  gate: { chain: string; contract: string; min: number; label: string } | null
  chains: Record<string, Chain>
  collections: Collection[]
}

const config: BoardConfig = {
  name: 'Mintboard',
  tagline: 'The mints this wallet can actually enter, and when.',
  accent: '#CCFF00',
  discordInvite: 'https://discord.gg/your-invite',

  gate: null,

  // Public endpoints, overridable with env vars so a busy community can point
  // at its own paid RPC without editing code. Add any EVM chain you need.
  chains: {
    ethereum: { rpc: process.env.RPC_ETHEREUM ?? 'https://ethereum-rpc.publicnode.com' },
    base: { rpc: process.env.RPC_BASE ?? 'https://mainnet.base.org' },
  },

  // Collections a mint can key off with a `holds` rule. The board reads
  // balanceOf against these and nothing else — it never scans a whole wallet,
  // so nobody can airdrop their way onto your board.
  collections: [
    // Shipped as a working example so a fresh clone reads a real chain on the
    // first run. Replace with your own — the board only ever reads balanceOf
    // against what is listed here.
    {
      id: 'bayc', name: 'Bored Ape Yacht Club', chain: 'ethereum',
      contract: '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d',
    },
  ],
}

export default config
