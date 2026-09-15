/**
 * How long a verification claim stays provable.
 *
 * This matters more than it looks. The verify address is the city vault,
 * which receives real traffic for reasons that have nothing to do with
 * verification — so "any transaction from W to the vault" can in principle be
 * satisfied by something W sent for its own reasons. Someone could open a
 * claim on a wallet they do not own and wait for its owner to touch the vault.
 *
 * An unbounded wait makes that a matter of patience. Thirty minutes makes it
 * a coincidence you would have to arrange, and it is still far longer than
 * sending a transaction takes. A dedicated address used for nothing else
 * would close the hole outright; until there is one, this is the brake.
 *
 * It lives apart from verify.ts so it can be tested without a database.
 */
export const CLAIM_MINUTES = 30

export const claimExpired = (requestedAt: string, now = Date.now()): boolean => {
  const t = Date.parse(requestedAt)
  // An unparseable timestamp counts as expired. The safe direction is making
  // somebody press the button again, not leaving a claim open forever.
  if (!Number.isFinite(t)) return true
  return now - t > CLAIM_MINUTES * 60_000
}
