/**
 * Whether a wallet has won a spot — the one question the board's gate should
 * have been asking all along.
 *
 * The gate asked the chain how many keys an address holds. That is the right
 * question for a stranger and the wrong one for a winner: somebody drawn a
 * spot who was not currently a Key Master got told "the board is for Key
 * Masters" and was shut out of the one page that tells them what they won.
 * Reported by a Toadstools winner on the day of the announcement.
 *
 * Being on a published spot list IS the credential — we put them there — and
 * checking it reads no chain, so a winner can never be locked out by an
 * endpoint having a bad minute.
 *
 * Pure, and free of path aliases, so it can actually be tested.
 */
export interface HasWallets { wallets?: string[] }

const lower = (s: string) => String(s ?? '').trim().toLowerCase()

export function wonIn(lists: Record<string, HasWallets>, addr: string): boolean {
  const a = lower(addr)
  if (!a) return false
  return Object.values(lists).some(l => (l.wallets ?? []).some(w => lower(w) === a))
}
