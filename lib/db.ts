/**
 * Talking to Supabase over PostgREST, with no client library.
 *
 * The repo has no runtime dependencies and this does not need to change that
 * — PostgREST is a REST API and fetch is already here. It also keeps the
 * surface small enough to read: there is exactly one place the secret key is
 * attached, and one place errors are turned into thrown Errors.
 *
 * EVERY CALL HERE IS PRIVILEGED. The key bypasses row level security, which
 * is why all five tables are sealed and why nothing in this file decides who
 * may do what — the routes do that, against a verified session, before they
 * get here.
 */
const URL_ = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
const KEY = process.env.SUPABASE_SECRET_KEY ?? ''

export const dbReady = () => Boolean(URL_ && KEY)

export async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!dbReady()) throw new Error('Supabase is not configured on this deployment.')
  return fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
}

async function read<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    // The status alone is useless when debugging a constraint violation, and
    // PostgREST puts the useful part in the body.
    throw new Error(`supabase ${r.status}: ${body.slice(0, 300)}`)
  }
  const text = await r.text()
  return (text ? JSON.parse(text) : null) as T
}

export const select = <T>(path: string) => rest(path).then(r => read<T>(r))

export const insert = <T>(table: string, row: unknown, prefer = 'return=representation') =>
  rest(table, { method: 'POST', body: JSON.stringify(row), headers: { prefer } }).then(r => read<T>(r))

export const update = <T>(path: string, patch: unknown) =>
  rest(path, { method: 'PATCH', body: JSON.stringify(patch), headers: { prefer: 'return=representation' } })
    .then(r => read<T>(r))

/**
 * Insert, or update if it is already there.
 *
 * Sign-in runs this on every visit; without the merge it would throw on the
 * unique handle the second time somebody signs in.
 */
export const upsert = <T>(table: string, row: unknown, onConflict: string) =>
  rest(`${table}?on_conflict=${onConflict}`, {
    method: 'POST', body: JSON.stringify(row),
    headers: { prefer: 'resolution=merge-duplicates,return=representation' },
  }).then(r => read<T>(r))
