import raffles from '@/data/raffles.json'
import type { RaffleEntry } from './types'

/**
 * Raffles still open, soonest to close first.
 *
 * A closed raffle drops off entirely rather than greying out. The box stops
 * taking hands the moment it shuts, so a card still offering to let somebody
 * in spends a click and returns a page that will not count them.
 */
export function liveRaffles(now = Date.now()): RaffleEntry[] {
  return (raffles as RaffleEntry[])
    .filter(r => {
      const t = Date.parse(r.closesAt)
      return Number.isFinite(t) && t > now
    })
    .sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt))
}
