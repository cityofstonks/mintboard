import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, adminEnabled, validToken } from '@/lib/auth'
import { readPartners, writePartners, storeMode } from '@/lib/store'
import type { Partner } from '@/lib/types'
import { callerOf, tooMany } from '@/lib/limit'
import { openRaffle, routingEnabled } from '@/lib/collab'

export const dynamic = 'force-dynamic'

const isAdmin = async () =>
  adminEnabled() && validToken((await cookies()).get(COOKIE)?.value)

/**
 * Approved partners only, unless an operator is asking.
 *
 * A pending submission is somebody's unverified claim about a mint. Serving it
 * publicly would let anyone put a project's name, date and allocation on a
 * directory that looks vetted, which is worse than having no directory.
 */
export async function GET() {
  const all = await readPartners()
  if (await isAdmin()) return NextResponse.json({ partners: all, mode: storeMode(), admin: true, routing: routingEnabled() })
  const publicFields = all
    .filter(p => p.status === 'approved')
    .map(({ contact: _contact, status: _status, ...rest }) => rest)
  return NextResponse.json({ partners: publicFields })
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

/** Anybody may submit. Nothing they submit is visible until it is approved. */
export async function POST(req: Request) {
  // Every accepted submission is a commit, so this one needs a brake.
  if (tooMany(`partner:${callerOf(req)}`, 3, 60 * 60_000)) {
    return NextResponse.json(
      { error: 'That is a few too many submissions in an hour. Try again later.' }, { status: 429 })
  }
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Could not read that.' }, { status: 400 })

  // Honeypot: a field no human sees and every naive bot fills in. Answering
  // 200 rather than an error means a bot has nothing to tune against.
  if (str(body.website, 200)) return NextResponse.json({ ok: true })

  const name = str(body.name, 80)
  const handle = str(body.handle, 40).replace(/^@/, '').replace(/^https?:\/\/(www\.)?x\.com\//i, '')
  const offer = str(body.offer, 200)
  if (!name) return NextResponse.json({ error: 'Your collection needs a name.' }, { status: 400 })
  if (!handle) return NextResponse.json({ error: 'An X handle, so a community can check you are real.' }, { status: 400 })
  if (!offer) return NextResponse.json({ error: 'Say what you are offering — "50 GTD" is enough.' }, { status: 400 })

  const mintRaw = str(body.mintAt, 40)
  const mintAt = mintRaw && Number.isFinite(Date.parse(mintRaw)) ? new Date(mintRaw).toISOString() : null
  const supplyRaw = Number(body.supply)
  const partner: Partner = {
    id: `${handle.toLowerCase()}-${Date.now().toString(36)}`,
    name, handle,
    chain: str(body.chain, 40) || 'not stated',
    supply: Number.isFinite(supplyRaw) && supplyRaw > 0 ? Math.floor(supplyRaw) : null,
    mintAt, offer,
    requirements: str(body.requirements, 400) || undefined,
    url: str(body.url, 200) || undefined,
    contact: str(body.contact, 200) || undefined,
    note: str(body.note, 600) || undefined,
    status: 'pending',
    submittedAt: new Date().toISOString(),
  }

  const all = await readPartners()
  // One live submission per handle, so a refresh or a double click does not
  // leave an operator reviewing the same project four times.
  if (all.some(p => p.handle.toLowerCase() === handle.toLowerCase() && p.status === 'pending')) {
    return NextResponse.json({ ok: true, duplicate: true })
  }
  all.push(partner)
  try {
    await writePartners(all, `partner submission: ${name}`)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

/**
 * Approve or decline. Operators only.
 *
 * `openRaffle: true` is what routes an approval through to Discord. It is a
 * separate opt-in rather than something approval always does, because listing
 * a partner in the directory and opening a raffle in your server are two
 * different decisions and an operator should make them one at a time.
 */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as {
    id?: string; status?: Partner['status']
    openRaffle?: boolean; gtd?: number; fcfs?: number; hours?: number; post?: string
  }
  const { id, status } = body
  if (!id || !status || !['pending', 'approved', 'declined'].includes(status)) {
    return NextResponse.json({ error: 'Need an id and a status.' }, { status: 400 })
  }
  const all = await readPartners()
  const at = all.findIndex(p => p.id === id)
  if (at === -1) return NextResponse.json({ error: 'No partner with that id.' }, { status: 404 })
  all[at] = { ...all[at], status }
  try {
    await writePartners(all, `${status} partner: ${all[at].name}`)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  if (!body.openRaffle || status !== 'approved') return NextResponse.json({ ok: true })

  /*
   * The status is already saved before this runs, on purpose. If the bot is
   * unreachable the approval still stands and the operator can retry the
   * raffle alone — rolling the approval back would make one failure look like
   * two and invite a second click that double-posts.
   */
  const routed = await openRaffle(all[at], {
    gtd: body.gtd, fcfs: body.fcfs, hours: body.hours, post: body.post,
  })
  return NextResponse.json({
    ok: true,
    raffle: routed.ok ? { messageId: routed.messageId } : null,
    raffleError: routed.ok ? undefined : routed.error,
  })
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const all = await readPartners()
  const next = all.filter(p => p.id !== id)
  if (next.length === all.length) return NextResponse.json({ error: 'No partner with that id.' }, { status: 404 })
  try {
    await writePartners(next, `remove partner: ${id}`)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
