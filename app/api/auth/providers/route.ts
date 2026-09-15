import { NextResponse } from 'next/server'
import { enabledProviders } from '@/lib/oauth'
import { adminEnabled } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Which sign-in methods this deployment actually has configured. */
export async function GET() {
  return NextResponse.json({ providers: enabledProviders(), password: adminEnabled() })
}
