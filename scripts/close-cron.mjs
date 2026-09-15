/**
 * The scheduled nudge that closes raffles whose time is up.
 *
 * Fly has no cron, so this runs on a scheduled machine in the same app —
 * which means it inherits the app's secrets and can authenticate to its own
 * endpoint without a second copy of anything.
 *
 * It is a backstop, not the mechanism. Any button press after a close already
 * triggers the sweep; this exists for a room that has gone quiet. On Vercel's
 * Hobby plan it could only run once a day, which left a drawn-but-unannounced
 * raffle sitting for up to 24 hours. Hourly is not a luxury here, it is the
 * gap closing.
 */
const BASE = process.env.SELF_URL ?? 'https://mintboard.fly.dev'
const SECRET = (process.env.CRON_SECRET ?? '').trim()

const r = await fetch(`${BASE}/api/cron/close`, {
  headers: SECRET ? { authorization: `Bearer ${SECRET}` } : {},
  signal: AbortSignal.timeout(120_000),
}).catch(e => { console.error('unreachable:', String(e)); return null })

if (!r) process.exit(1)
const body = await r.text()
console.log(`[close-cron] ${r.status} ${body.slice(0, 900)}`)
// A non-2xx is a real failure and should mark the machine run as failed, so
// it shows up in `fly logs` rather than looking like a quiet success.
if (!r.ok) process.exit(1)
