/**
 * Giving somebody the role their holdings earn.
 *
 * Needs a bot token, which is the one thing an interaction reply cannot do
 * for us — a reply can say anything but cannot change a member. Absent the
 * token the rest of verification still works and this simply reports that it
 * could not act, which is far better than verifying somebody and silently
 * leaving them without the role.
 */
const TOKEN = (process.env.DISCORD_BOT_TOKEN ?? '').trim()
export const canAssignRoles = () => TOKEN.length > 0

const H = () => ({
  Authorization: `Bot ${TOKEN}`,
  'User-Agent': 'Mintboard (https://mintboard-pi.vercel.app, 1.0)',
  'content-type': 'application/json',
})

/** Tiers, richest first. The first one a wallet clears is the one they get. */
export interface Tier { minHeld: number; roleId: string; name: string }

export function tierFor(held: number, tiers: Tier[]): Tier | null {
  return [...tiers].sort((a, b) => b.minHeld - a.minHeld).find(t => held >= t.minHeld) ?? null
}

export async function addRole(guildId: string, userId: string, roleId: string): Promise<boolean> {
  if (!canAssignRoles()) return false
  const r = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    { method: 'PUT', headers: { ...H(), 'X-Audit-Log-Reason': 'Wallet verified' } },
  ).catch(() => null)
  return r?.ok === true || r?.status === 204
}

export async function removeRole(guildId: string, userId: string, roleId: string): Promise<boolean> {
  if (!canAssignRoles()) return false
  const r = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    { method: 'DELETE', headers: { ...H(), 'X-Audit-Log-Reason': 'Holdings changed' } },
  ).catch(() => null)
  return r?.ok === true || r?.status === 204
}

/**
 * Bring somebody's roles in line with what they hold.
 *
 * Adds the tier they have earned and removes the ones they have not. A holder
 * who sold down keeps nothing they are no longer entitled to — but a FAILED
 * READ must never reach here as zero, or a chain hiccup strips the room.
 */
export async function syncTiers(
  guildId: string, userId: string, held: number, tiers: Tier[],
): Promise<{ granted: Tier | null; removed: string[] }> {
  const earned = tierFor(held, tiers)
  const removed: string[] = []
  for (const t of tiers) {
    if (earned && t.roleId === earned.roleId) continue
    if (await removeRole(guildId, userId, t.roleId)) removed.push(t.name)
  }
  if (earned) await addRole(guildId, userId, earned.roleId)
  return { granted: earned, removed }
}
