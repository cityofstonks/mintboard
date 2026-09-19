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

/*
 * Once a day, also re-measure how our winners behaved with spots we won.
 *
 * Riding the existing hourly machine rather than adding a second scheduled
 * one: two schedulers is two things to notice have stopped, and this codebase
 * has already been bitten once by a scheduler running for hours past a
 * deadline with nobody watching.
 *
 * Daily, not hourly. Retention moves slowly and each pass is a request per
 * winner against a public explorer — running it twenty-four times a day would
 * be rude to ordinals.com and would tell us nothing new.
 *
 * Its failure is logged but NOT fatal. Closing raffles is the job this machine
 * exists for, and a stats scan that cannot reach an explorer must never make a
 * successful close look like a failed run.
 */
if (new Date().getUTCHours() === 6) {
  const o = await fetch(`${BASE}/api/cron/outcomes`, {
    headers: SECRET ? { authorization: `Bearer ${SECRET}` } : {},
    signal: AbortSignal.timeout(280_000),
  }).catch(e => { console.error('[outcomes] unreachable:', String(e)); return null })
  if (o) console.log(`[outcomes] ${o.status} ${(await o.text()).slice(0, 600)}`)
}
