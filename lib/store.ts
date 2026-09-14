import type { Partner, RaffleEntry } from './types'
import bundled from '@/data/raffles.json'
import bundledPartners from '@/data/partners.json'

/**
 * Where raffles live at runtime.
 *
 * Vercel's filesystem is READ-ONLY once deployed, so an admin page cannot
 * simply rewrite data/raffles.json the way it can in dev. Rather than drag a
 * database into a tool whose whole pitch is "clone it and deploy", writes go
 * back to GitHub through the Contents API: the repo stays the source of
 * truth, every change is a commit with an author and a message, and undoing a
 * bad edit is `git revert` rather than an argument about what it used to say.
 *
 * Three modes, chosen by what is configured:
 *
 *   github    GITHUB_TOKEN + GITHUB_REPO set. Reads and writes the live file.
 *   local     no token, writable filesystem (npm run dev). Writes the file.
 *   readonly  deployed without a token. The board works; the admin says why
 *             it cannot save, instead of pretending to and losing the edit.
 */
export type StoreMode = 'github' | 'local' | 'readonly'

const TOKEN = process.env.GITHUB_TOKEN ?? ''
const REPO = process.env.GITHUB_REPO ?? ''          // "owner/name"
const BRANCH = process.env.GITHUB_BRANCH ?? 'main'
type DataFile = 'data/raffles.json' | 'data/partners.json'

export function storeMode(): StoreMode {
  if (TOKEN && REPO) return 'github'
  return process.env.VERCEL ? 'readonly' : 'local'
}

const gh = (path: string, init?: RequestInit) => fetch(`https://api.github.com/repos/${REPO}/${path}`, {
  ...init,
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(init?.headers ?? {}),
  },
  cache: 'no-store',
})

/**
 * Short cache. Long enough that a busy board is not hammering the GitHub API
 * on every page load, short enough that an admin edit shows up while the
 * person who made it is still looking at the page.
 */
const cache = new Map<string, { at: number; data: unknown }>()
const TTL = 10_000

async function readFile<T>(path: DataFile, fallback: T): Promise<T> {
  if (storeMode() !== 'github') return fallback
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL) return hit.data as T
  try {
    const r = await gh(`contents/${path}?ref=${encodeURIComponent(BRANCH)}`)
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json() as { content: string }
    const data = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')) as T
    cache.set(path, { at: Date.now(), data })
    return data
  } catch {
    // A GitHub outage must not empty the board. The copy built into the
    // deployment is stale, but stale is a great deal better than blank.
    return (cache.get(path)?.data as T) ?? fallback
  }
}

export const readRaffles = () => readFile<RaffleEntry[]>('data/raffles.json', bundled as RaffleEntry[])
export const readPartners = () => readFile<Partner[]>('data/partners.json', bundledPartners as Partner[])

export const writeRaffles = (list: RaffleEntry[], message: string) =>
  writeFile('data/raffles.json', list, message)
export const writePartners = (list: Partner[], message: string) =>
  writeFile('data/partners.json', list, message)

async function writeFile(path: DataFile, list: unknown, message: string): Promise<void> {
  const body = JSON.stringify(list, null, 2) + '\n'
  const mode = storeMode()

  if (mode === 'readonly') {
    throw new Error(
      'This deployment has no GITHUB_TOKEN, so it cannot save. Set GITHUB_TOKEN and '
      + 'GITHUB_REPO in your Vercel project settings, or edit data/raffles.json on GitHub directly.')
  }

  if (mode === 'local') {
    const { writeFile: write } = await import('node:fs/promises')
    const { join } = await import('node:path')
    // Literal paths, not join(cwd, path). A dynamic join here makes the
    // bundler give up on tracing and pull the WHOLE project into the server
    // output — every source file and the public folder with it.
    const target = path === 'data/raffles.json'
      ? join(process.cwd(), 'data', 'raffles.json')
      : join(process.cwd(), 'data', 'partners.json')
    await write(target, body, 'utf8')
    return
  }

  // Read the current sha first: GitHub refuses a blind overwrite, which is
  // the behaviour we want — two admins editing at once should collide loudly
  // rather than one silently discarding the other.
  const head = await gh(`contents/${path}?ref=${encodeURIComponent(BRANCH)}`)
  const sha = head.ok ? (await head.json() as { sha: string }).sha : undefined
  const r = await gh(`contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message, branch: BRANCH, sha,
      content: Buffer.from(body, 'utf8').toString('base64'),
    }),
  })
  if (!r.ok) throw new Error(`GitHub refused the write (${r.status}): ${(await r.text()).slice(0, 200)}`)
  cache.set(path, { at: Date.now(), data: list })
}
