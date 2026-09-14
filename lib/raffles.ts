import { readRaffles } from './store'
import type { RaffleEntry } from './types'

/**
 * Raffles still open, soonest to close first.
 *
 * A closed raffle drops off entirely rather than greying out. The box stops
 * taking hands the moment it shuts, so a card still offering to let somebody
 * in spends a click and returns a page that will not count them.
 */
export async function liveRaffles(now = Date.now()): Promise<RaffleEntry[]> {
  const all = await readRaffles()
  return all
    .filter(r => {
      const t = Date.parse(r.closesAt)
      return Number.isFinite(t) && t > now
    })
    .sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt))
}
