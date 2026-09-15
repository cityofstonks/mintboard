import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, signedIn } from '@/lib/auth'
import { ops } from '@/lib/ops'

export const dynamic = 'force-dynamic'

export async function GET() {
  const jar = await cookies()
  if (!signedIn(jar.get(COOKIE)?.value)) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  try {
    return NextResponse.json(await ops())
  } catch (err) {
    // A failed read is reported as a failure, never as an empty board.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not read operations.' }, { status: 503 })
  }
}
