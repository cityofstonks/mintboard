/**
 * What a collection's owner may change.
 *
 * Its own file with no framework imports so it can be tested under plain
 * `node --test`. This is the gate between a JSON body somebody posted and an
 * UPDATE on a row — the single most consequential function in the account
 * system, and the third one today that would have been untestable purely
 * because of where it lived.
 */

/** Fields a collection's owner is allowed to change. Nothing else is writable. */
const EDITABLE = ['name', 'icon', 'chain', 'contract', 'x_handle', 'discord_url', 'opensea_url', 'blurb'] as const
export type Editable = Partial<Record<typeof EDITABLE[number], string | null>>

/**
 * Keep only the fields an owner may set.
 *
 * An allowlist rather than a denylist: a denylist has to be updated every
 * time a column is added, and the column somebody forgets is owner_id.
 */
export function onlyEditable(patch: Record<string, unknown>): Editable {
  const out: Editable = {}
  for (const k of EDITABLE) {
    if (!(k in patch)) continue
    const v = patch[k]
    out[k] = v === null || v === '' ? null : String(v).trim().slice(0, 600)
  }
  if (typeof out.x_handle === 'string') out.x_handle = out.x_handle.toLowerCase().replace(/^@/, '')
  return out
}
