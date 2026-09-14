import { readRaffles } from './store'
import type { RaffleEntry } from './types'

/**
 * Opportunities still open, soonest to close first.
 *
 * A closed raffle drops off entirely rather than greying out. The box stops
 * taking hands the moment it shuts, so a card still offering to let somebody
 * in spends a click and returns a page that will not count them.
 *
 * An entry with no `closesAt` is open-ended, not expired — a claim that runs
 * until supply is gone. Those survive the filter and sort after the dated
 * ones, because nothing is lost by reading them a minute later.
 */
export async function liveRaffles(now = Date.now()): Promise<RaffleEntry[]> {
  const all = await readRaffles()
  const at = (r: RaffleEntry) => (r.closesAt ? Date.parse(r.closesAt) : NaN)
  return all
    .filter(r => {
      const t = at(r)
      return Number.isFinite(t) ? t > now : true
    })
    .sort((a, b) => {
      const x = at(a), y = at(b)
      if (Number.isFinite(x) && Number.isFinite(y)) return x - y
      if (Number.isFinite(x)) return -1   // dated first: they can actually run out
      if (Number.isFinite(y)) return 1
      return 0
    })
}
