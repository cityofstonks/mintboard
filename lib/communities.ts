import communities from '@/data/communities.json'
import type { Community } from './types'

const ALL = communities as Community[]

export const allCommunities = (): Community[] => ALL

export const communityById = (id: string): Community | null =>
  ALL.find(c => c.id.toLowerCase() === id.trim().toLowerCase()) ?? null

/**
 * The communities an opportunity is open to, resolved to real records.
 *
 * An id with no matching community is DROPPED rather than rendered as a bare
 * id. A card saying "open to holders of zorp-v2" helps nobody, and a typo in
 * a data file should degrade to showing less, never to showing gibberish.
 */
export const communitiesFor = (ids: string[] | undefined): Community[] =>
  (ids ?? []).map(id => communityById(id)).filter((c): c is Community => c !== null)
