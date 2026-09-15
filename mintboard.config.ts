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
  /** Any CSS colour. The two blend through the buttons and the backdrop. */
  accent: string
  accent2: string
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
  // Pick any two. Everything else — buttons, the aurora behind the glass, the
  // highlighted phase — is mixed from them, so one change reskins the tool.
  accent: '#CCFF00',
  accent2: '#6EE7B7',
  discordInvite: 'https://discord.gg/cityofstonks',

  /*
   * This deployment runs a real community's board.
   *
   * Mintboard is the tool; the data here is City of Stonks', live. A tool
   * demonstrated on "Demo Drop" asks people to imagine it working — this one
   * shows 232 wallets across nine mints, and anybody holding a key can paste
   * their address and check the result against what they already know.
   *
   * A fresh clone replaces everything below and nothing above it.
   */
  /*
   * No gate. Anybody may check any wallet.
   *
   * It used to require a key. The reasoning was that the board is for holders
   * — but the board's job is to answer "what did I win", and the people most
   * in need of that answer are the ones who won a spot and hold nothing:
   * 69 of our 108 spot winners. Asking them to prove they belong before
   * telling them what they already own had it exactly backwards.
   *
   * Nothing here is secret. Every spot list is published, every wallet on it
   * was drawn in the open, and a stranger pasting an address learns only what
   * that address already won. There was never much to protect.
   */
  gate: null,

  // Public endpoints, overridable with env vars so a busy community can point
  // at its own paid RPC without editing code. Add any EVM chain you need.
  chains: {
    ethereum: { rpc: process.env.RPC_ETHEREUM ?? 'https://ethereum-rpc.publicnode.com' },
    base: { rpc: process.env.RPC_BASE ?? 'https://mainnet.base.org' },
    robinhood: { rpc: process.env.RPC_ROBINHOOD ?? 'https://rpc.mainnet.chain.robinhood.com' },
  },

  // Collections a mint can key off with a `holds` rule. The board reads
  // balanceOf against these and nothing else — it never scans a whole wallet,
  // so nobody can airdrop their way onto your board.
  collections: [
    { id: 'stonkbrokers', name: 'Stonk Brokers', chain: 'robinhood',
      contract: '0x539cdd042c2f3d93ebc5be7dfff0c79f3b4fabf0' },
    { id: 'zorpians', name: 'Zorpians', chain: 'robinhood',
      contract: '0xfc02048498b65040a4e21a2eba54cfc48846e2ad' },
    { id: 'cannacats', name: 'CannaCats', chain: 'robinhood',
      contract: '0x289c8ce652f38029867842048068b39bd0464a3f' },
    { id: 'wifoutlaws', name: 'WIF Outlaws', chain: 'robinhood',
      contract: '0x12a4c7659a4b7c4a2870b5167c4f8b014c7fa690' },
  ],
}

export default config
