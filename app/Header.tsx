'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import config from '@/mintboard.config'

/**
 * The bar across the top.
 *
 * Every page had its own scattering of links at the bottom and no way back to
 * anywhere from the top, which is fine for one page and gets worse with each
 * one added. This is the one place a person can always reach the rest from.
 *
 * It sticks, because the board is a long scroll and the thing you most want
 * after reading it is somewhere else. It does NOT hide on scroll — a header
 * that plays peekaboo costs more attention than the strip of screen it saves.
 */

const LINKS: [string, string][] = [
  ['/', 'Open now'],
  ['/board', 'The board'],
  ['/partners', 'Collections'],
  ['/guide', 'Guide'],
]

export default function Header() {
  const path = usePathname() ?? '/'
  const [open, setOpen] = useState(false)
  /** undefined = not asked yet, null = signed out, string = who. */
  const [who, setWho] = useState<string | null | undefined>(undefined)

  // Asked on every page, because the header is on every page. Re-asked on
  // navigation so signing out in one tab is noticed in the next.
  useEffect(() => {
    let live = true
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => { if (live) setWho(d.identity ?? null) })
      .catch(() => { if (live) setWho(null) })
    return () => { live = false }
  }, [path])

  async function signOut() {
    await fetch('/api/auth/me', { method: 'DELETE' }).catch(() => {})
    setWho(null)
    // A hard reload, so any page showing signed-in data drops it rather than
    // keeping a stale view of something you no longer have access to.
    window.location.href = '/'
  }


  // A route change must close the menu, or you navigate and the panel stays up
  // over the page you asked for.
  useEffect(() => { setOpen(false) }, [path])

  // Escape closes it. Anything that traps you on a phone is a bug.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  /*
   * Never inside somebody else's page.
   *
   * /embed is an iframe on a host site. A header there would put OUR nav
   * inside THEIR layout, offering their visitors a way out of it — which is
   * the opposite of what an embed is for, and the sort of thing that gets a
   * board quietly removed.
   */
  if (path.startsWith('/embed')) return null

  const active = (href: string) => href === '/' ? path === '/' : path.startsWith(href)

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'color-mix(in oklab, var(--bg) 82%, transparent)',
      backdropFilter: 'blur(14px) saturate(160%)',
      borderBottom: '1px solid var(--edge)',
    }}>
      <nav aria-label="Main" style={{
        maxWidth: 1120, margin: '0 auto', padding: '0 20px',
        display: 'flex', alignItems: 'center', gap: 16, minHeight: 58,
      }}>
        <a href="/" style={{
          textDecoration: 'none', fontWeight: 650, letterSpacing: '-.02em',
          fontSize: 16, color: 'var(--ink)', whiteSpace: 'nowrap',
        }}>
          {config.name}
        </a>

        {/* Wide: the links inline. Narrow: behind the button below. */}
        <div className="nav-wide" style={{ display: 'flex', gap: 2, marginLeft: 6 }}>
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} aria-current={active(href) ? 'page' : undefined}
              style={{
                textDecoration: 'none', fontSize: 13.5, fontWeight: 540,
                padding: '7px 11px', borderRadius: 999, whiteSpace: 'nowrap',
                color: active(href) ? 'var(--ink)' : 'var(--muted)',
                background: active(href) ? 'var(--glass-soft)' : 'transparent',
              }}>{label}</a>
          ))}
        </div>

        <span style={{ flex: 1 }} />

        <div className="nav-wide" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {who ? (
            <>
              <a href="/admin" title="Signed in" style={{
                textDecoration: 'none', fontSize: 13, fontWeight: 560,
                padding: '8px 13px', borderRadius: 999, whiteSpace: 'nowrap',
                border: '1px solid color-mix(in oklab, var(--accent) 40%, transparent)',
                background: 'color-mix(in oklab, var(--accent) 12%, transparent)',
                color: 'var(--ink)',
              }}>{who}</a>
              <button type="button" onClick={signOut} style={{
                background: 'none', color: 'var(--faint)', boxShadow: 'none',
                padding: '8px 10px', fontSize: 13, fontWeight: 540,
              }}>Sign out</button>
            </>
          ) : (
            // Nothing is rendered until we know — a "Sign in" that flips to a
            // username a moment later reads as being signed out and back in.
            who === null && (
              <a href="/admin" style={{
                textDecoration: 'none', fontSize: 13, fontWeight: 560,
                padding: '8px 14px', borderRadius: 999, whiteSpace: 'nowrap',
                border: '1px solid var(--edge)', background: 'var(--glass-soft)', color: 'var(--muted)',
              }}>Sign in</a>
            )
          )}
        </div>

        <button type="button" className="nav-narrow" onClick={() => setOpen(o => !o)}
          aria-expanded={open} aria-controls="nav-panel" aria-label="Menu"
          style={{
            background: 'var(--glass-soft)', color: 'var(--ink)', border: '1px solid var(--edge)',
            boxShadow: 'none', padding: '8px 13px', fontSize: 13,
          }}>
          {open ? 'Close' : 'Menu'}
        </button>
      </nav>

      {open && (
        <div id="nav-panel" className="nav-narrow" style={{
          borderTop: '1px solid var(--edge)', padding: '8px 20px 14px',
          display: 'grid', gap: 2, maxWidth: 1120, margin: '0 auto',
        }}>
          {[...LINKS, [who ? '/admin' : '/admin', who ? `Signed in as ${who}` : 'Sign in'] as [string, string]].map(([href, label]) => (
            <a key={href} href={href} aria-current={active(href) ? 'page' : undefined}
              style={{
                textDecoration: 'none', fontSize: 15, padding: '11px 12px', borderRadius: 10,
                color: active(href) ? 'var(--ink)' : 'var(--muted)',
                background: active(href) ? 'var(--glass-soft)' : 'transparent',
              }}>{label}</a>
          ))}
          {who && (
            <button type="button" onClick={signOut} style={{
              background: 'none', color: 'var(--faint)', boxShadow: 'none',
              textAlign: 'left', padding: '11px 12px', fontSize: 15,
            }}>Sign out</button>
          )}
        </div>
      )}
    </header>
  )
}
