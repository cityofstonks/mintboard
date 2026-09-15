/**
 * Ordinal delivery addresses, and tying them to the person who owns them.
 *
 * The link between somebody's Bitcoin address and their EVM wallets is their
 * Discord account — that is the only identity that spans both chains here, and
 * it is the one the rest of the system already keys off.
 *
 * These addresses are DECLARED, not proven. An EVM wallet is proven by sending
 * a transaction that costs a fraction of a cent; the same trick on Bitcoin
 * costs a real fee and asks somebody to move actual money to enter a free
 * mint. So we record what they tell us, check it is a well-formed taproot
 * address, and keep the distinction visible rather than letting a declared
 * address sit next to a proven one looking identical.
 */
import { select, insert, update } from './db'
import { readAddress } from './bitcoin'

export interface Ordinal { wallet: string; declared_at: string; verified_at: string | null }

export const ordinalsOf = async (discordUserId: string): Promise<Ordinal[]> =>
  (await select<Ordinal[]>(
    `ordinal_wallets?discord_user_id=eq.${discordUserId}&unlinked_at=is.null`
    + `&select=wallet,declared_at,verified_at&order=declared_at.asc`)) ?? []

export const ordinalOwner = async (wallet: string): Promise<{ discord_user_id: string } | null> =>
  ((await select<{ discord_user_id: string }[]>(
    `ordinal_wallets?wallet=eq.${wallet}&unlinked_at=is.null&select=discord_user_id&limit=1`)) ?? [])[0] ?? null

export type Declared =
  | { ok: true; wallet: string; replaced: boolean }
  | { ok: false; why: string }

/**
 * Record a delivery address, refusing anything an inscription would die in.
 *
 * One address per person: a second declaration replaces the first rather than
 * stacking. For delivery that is what you want — "where do I send it" has to
 * have exactly one answer, and a list of three is the same as no answer at the
 * moment somebody is actually sending.
 */
export async function declare(
  discordUserId: string, guildId: string, input: string,
): Promise<Declared> {
  const addr = readAddress(input)
  if (!addr.canHoldInscription) {
    return { ok: false, why: addr.why ?? 'that is not a taproot address' }
  }
  const wallet = input.trim().toLowerCase()

  const taken = await ordinalOwner(wallet)
  if (taken && taken.discord_user_id !== discordUserId) {
    // Not named, for the same reason an EVM wallet's owner is not named.
    return { ok: false, why: 'that address is already on file for someone else' }
  }

  const mine = await ordinalsOf(discordUserId)
  const replaced = mine.length > 0 && !mine.some(m => m.wallet === wallet)
  if (replaced) {
    await update(`ordinal_wallets?discord_user_id=eq.${discordUserId}&unlinked_at=is.null`,
      { unlinked_at: new Date().toISOString() })
  }
  if (!mine.some(m => m.wallet === wallet)) {
    await insert('ordinal_wallets',
      { wallet, discord_user_id: discordUserId, guild_id: guildId, kind: 'taproot' }, 'return=minimal')
  }
  return { ok: true, wallet, replaced }
}
