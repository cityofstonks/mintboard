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

/**
 * Tiers. A wallet gets EVERY tier it clears, not only the best one.
 *
 * That is not an assumption — it is what the server already does. All 116 Key
 * Masters in City of Stonks also hold Key Holder, 116 of 116 with no
 * exceptions, so the roles stack rather than replace. Granting only the top
 * tier would have given new verifiers Key Master without Key Holder and quietly
 * cut them out of everything gated on the lower role.
 */
export interface Tier { minHeld: number; roleId: string; name: string }

/** The best tier a holding clears, for saying out loud. */
export function tierFor(held: number, tiers: Tier[]): Tier | null {
  return [...tiers].sort((a, b) => b.minHeld - a.minHeld).find(t => held >= t.minHeld) ?? null
}

/** Every tier a holding clears, richest first — all of which get granted. */
export function tiersEarned(held: number, tiers: Tier[]): Tier[] {
  if (!Number.isFinite(held)) return []
  return [...tiers].sort((a, b) => b.minHeld - a.minHeld).filter(t => held >= t.minHeld)
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
 * GRANTING ONLY, unless somebody deliberately asks otherwise.
 *
 * This is the whole reason the function is careful. A verified balance is a
 * FLOOR, not a total: we can only ever see the wallets a person chose to
 * link, so somebody who verifies one empty burner looks exactly like somebody
 * who sold everything. Revoking on that reading would strip a Key Master who
 * simply has not linked their cold wallet yet — the same mistake as every
 * other bug here, a count we could not complete being reported as a count
 * of zero.
 *
 * Taking a role away is also the one action in this system that costs
 * somebody something, which makes it the one that should never happen as a
 * side effect. When holdings really do need reconciling, that is a deliberate
 * sweep somebody runs on purpose — `revoke: true` — not a thing a button does
 * quietly on the way past.
 */
export async function syncTiers(
  guildId: string, userId: string, held: number, tiers: Tier[],
  { revoke = false } = {},
): Promise<{ granted: Tier | null; removed: string[] }> {
  const earned = tiersEarned(held, tiers)
  const top = earned[0] ?? null
  const removed: string[] = []

  if (revoke) {
    for (const t of tiers) {
      if (earned.some(e => e.roleId === t.roleId)) continue
      if (await removeRole(guildId, userId, t.roleId)) removed.push(t.name)
    }
  }
  // Every tier, not just the top one. Discord ignores a role somebody already
  // has, so this is safe to run repeatedly.
  for (const t of earned) await addRole(guildId, userId, t.roleId)
  return { granted: top, removed }
}
