/**
 * Deciding whether an engagement proof is worth the multiplier.
 *
 * These are the checks that can be made from the link alone, without opening
 * it. They do not read the post — they cannot tell you whether it tags the
 * right account — but they catch every cheap way of claiming a boost without
 * doing the work, and they catch it consistently rather than depending on
 * somebody being awake.
 *
 * This exists because 21 people filed proof on the Hood Walkers raffle, were
 * told "it is checked before the draw", and were still unapproved with four
 * hours left. Nothing checked, because checking was a person's job that had
 * never been scheduled. A promise nothing keeps is worse than no promise.
 */

export interface Proof { userId: string; url: string }
export interface Verdict { userId: string; ok: boolean; handle?: string; why?: string }

const STATUS = /(?:x|twitter)\.com\/([A-Za-z0-9_]+)\/status\/(\d+)/i
const X_EPOCH = 1288834974657n

/** When a post was made, straight out of its id. */
export const postedAt = (statusId: string): number | null => {
  try { return Number((BigInt(statusId) >> 22n) + X_EPOCH) } catch { return null }
}

/**
 * Judge a batch together, because the interesting failures are relational:
 * one person filing two links, two people filing the same post, somebody
 * linking the project's own announcement instead of their reply.
 */
export function judge(
  proofs: Proof[],
  opts: { projectHandle?: string; openedAt: number; closesAt: number },
): Verdict[] {
  const byHandle = new Map<string, string>()
  const byStatus = new Map<string, string>()
  const project = (opts.projectHandle ?? '').replace(/^@/, '').toLowerCase()

  return proofs.map(({ userId, url }) => {
    const m = url.match(STATUS)
    if (!m) return { userId, ok: false, why: 'not a link to a post' }
    const handle = m[1], status = m[2]
    const h = handle.toLowerCase()

    if (project && h === project) return { userId, ok: false, handle, why: "links the project's own post" }

    const t = postedAt(status)
    // An unreadable id is not a valid proof, but it is also not an accusation
    // — it simply cannot be judged from here.
    if (t === null) return { userId, ok: false, handle, why: 'could not read the post id' }
    if (t < opts.openedAt) return { userId, ok: false, handle, why: 'posted before the raffle opened' }
    if (t > opts.closesAt) return { userId, ok: false, handle, why: 'posted after the raffle closed' }

    // Post before handle: when two people file the exact same link, "the same
    // post" is the true description and "the same account" is merely implied
    // by it. Telling somebody the precise thing that is wrong is the whole
    // difference between a message they can act on and one they argue with.
    const dupS = byStatus.get(status)
    if (dupS && dupS !== userId) return { userId, ok: false, handle, why: 'same post as another entrant' }
    const dupH = byHandle.get(h)
    if (dupH && dupH !== userId) return { userId, ok: false, handle, why: 'same X account as another entrant' }

    byHandle.set(h, userId)
    byStatus.set(status, userId)
    return { userId, ok: true, handle }
  })
}
