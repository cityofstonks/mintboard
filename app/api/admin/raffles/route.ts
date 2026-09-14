import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, adminEnabled, validToken } from '@/lib/auth'
import { readRaffles, writeRaffles, storeMode } from '@/lib/store'
import type { RaffleEntry } from '@/lib/types'

export const dynamic = 'force-dynamic'

async function guard() {
  if (!adminEnabled()) return 'The admin is switched off — no ADMIN_PASSWORD is set.'
  const jar = await cookies()
  if (!validToken(jar.get(COOKIE)?.value)) return 'Not signed in.'
  return null
}

/** Everything, including closed ones — an admin needs to see what fell off. */
export async function GET() {
  const bad = await guard()
  if (bad) return NextResponse.json({ error: bad }, { status: 401 })
  return NextResponse.json({ raffles: await readRaffles(), mode: storeMode() })
}

function clean(r: Partial<RaffleEntry>): RaffleEntry | string {
  const project = String(r.project ?? '').trim()
  if (!project) return 'A raffle needs a project name.'
  const kind: 'raffle' | 'claim' = r.kind === 'claim' ? 'claim' : 'raffle'
  // Blank is allowed and means open-ended. Only a value that was typed and is
  // unreadable is an error — silently dropping a mistyped date would publish
  // an opportunity as never-closing when somebody meant it to close tonight.
  const typed = String(r.closesAt ?? '').trim()
  if (typed && !Number.isFinite(Date.parse(typed))) return 'Closing time is not a date I can read.'
  const closesAt = typed ? new Date(typed).toISOString() : null
  if (!closesAt && kind === 'raffle') {
    return 'A raffle needs a closing time — that is when you draw. Set it to a claim if it just runs until it fills.'
  }
  const tiers = (r.tiers ?? []).map(t => ({
    label: String(t.label ?? '').trim() || 'Spots',
    // null, not 0: an uncapped tier is a blanket allowlist, and printing a
    // number beside one invents a competition that does not exist.
    count: t.count === null || t.count === undefined || String(t.count) === '' ? null : Number(t.count),
    who: String(t.who ?? '').trim() || 'everyone who qualifies',
    drawn: t.drawn !== false,
  }))
  if (!tiers.length) return 'A raffle needs at least one tier.'
  return {
    id: String(r.id ?? '').trim() || `raffle-${Date.now().toString(36)}`,
    project, kind, closesAt, tiers,
    enterUrl: String(r.enterUrl ?? '').trim() || undefined,
    url: String(r.url ?? '').trim() || undefined,
    homework: String(r.homework ?? '').trim() || undefined,
    note: String(r.note ?? '').trim() || undefined,
  }
}

export async function POST(req: Request) {
  const bad = await guard()
  if (bad) return NextResponse.json({ error: bad }, { status: 401 })
  const body = await req.json().catch(() => null) as Partial<RaffleEntry> | null
  if (!body) return NextResponse.json({ error: 'Could not read that.' }, { status: 400 })
  const next = clean(body)
  if (typeof next === 'string') return NextResponse.json({ error: next }, { status: 400 })

  const all = await readRaffles()
  const at = all.findIndex(r => r.id === next.id)
  const verb = at === -1 ? 'add' : 'update'
  if (at === -1) all.push(next); else all[at] = next
  try {
    await writeRaffles(all, `${verb} raffle: ${next.project}`)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, raffle: next })
}

export async function DELETE(req: Request) {
  const bad = await guard()
  if (bad) return NextResponse.json({ error: bad }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  const all = await readRaffles()
  const next = all.filter(r => r.id !== id)
  if (next.length === all.length) return NextResponse.json({ error: 'No raffle with that id.' }, { status: 404 })
  try {
    await writeRaffles(next, `remove raffle: ${id}`)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
