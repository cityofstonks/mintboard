'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Collection } from '@/lib/accounts'

/**
 * Where a community owner actually does things.
 *
 * The APIs for claiming and editing have existed and been tested for a while
 * with nothing on top of them, which meant the feature was real and unusable.
 * This is the surface.
 *
 * Three states, and the empty one matters most: somebody arriving here for the
 * first time owns nothing, and the page has to tell them how that changes
 * rather than showing them a blank.
 */

interface Manager { profile_id: string; role: string; profiles: { x_handle: string } | null }
interface Claim {
  id: string; collection_id: string; profile_id: string; evidence: string | null
  profiles: { x_handle: string } | null
  collections: { name: string; x_handle: string | null } | null
}

const FIELDS: [keyof Collection, string, string][] = [
  ['name', 'Name', 'Wall Street Trader Card'],
  ['icon', 'Icon', '📈  one or two emoji'],
  ['blurb', 'Blurb', 'One line. What you are, in your own words.'],
  ['x_handle', 'X handle', 'yourproject  — no @'],
  ['discord_url', 'Discord invite', 'https://discord.gg/…'],
  ['opensea_url', 'OpenSea', 'https://opensea.io/collection/…'],
  ['chain', 'Chain', 'robinhood'],
  ['contract', 'Contract', '0x…'],
]

export default function Dashboard() {
  const [handle, setHandle] = useState<string | null>(null)
  const [operator, setOperator] = useState(false)
  const [mine, setMine] = useState<Collection[] | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [managers, setManagers] = useState<Record<string, Manager[]>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [slug, setSlug] = useState('')
  const [evidence, setEvidence] = useState('')
  const [edits, setEdits] = useState<Record<string, Partial<Collection>>>({})
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/collections/mine')
    if (r.status === 401) { setHandle(null); setMine([]); return }
    if (!r.ok) { setMsg((await r.json()).error ?? 'Could not load.'); setMine([]); return }
    const d = await r.json()
    setHandle(d.handle ?? null); setOperator(Boolean(d.operator)); setMine(d.collections ?? [])
    if (d.operator) {
      const cr = await fetch('/api/claims')
      if (cr.ok) setClaims((await cr.json()).claims ?? [])
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function claim(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    const r = await fetch('/api/collections/claim', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, evidence }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    // Verified and queued are different outcomes and must read differently —
    // "submitted" for both would leave somebody waiting on an approval that
    // already happened.
    setMsg(d.message ?? d.error ?? 'Could not claim that.')
    if (r.ok) { setSlug(''); setEvidence(''); void load() }
  }

  async function save(id: string) {
    const patch = edits[id]
    if (!patch || !Object.keys(patch).length) { setMsg('Nothing changed.'); return }
    setBusy(true)
    const r = await fetch(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? 'Saved.' : (d.error ?? 'Could not save.'))
    if (r.ok) { setEdits(s => ({ ...s, [id]: {} })); void load() }
  }

  async function loadManagers(id: string) {
    const r = await fetch(`/api/collections/${encodeURIComponent(id)}/managers`)
    if (!r.ok) return
    // Resolved before the updater: the callback passed to a state setter is
    // not async, so awaiting inside it is a syntax error rather than a wait.
    const list = (await r.json()).managers ?? []
    setManagers(s => ({ ...s, [id]: list }))
  }

  async function addManager(id: string, who: string) {
    setBusy(true)
    const r = await fetch(`/api/collections/${encodeURIComponent(id)}/managers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: who }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? `Added ${who}.` : (d.error ?? 'Could not add them.'))
    if (r.ok) setManagers(s => ({ ...s, [id]: d.managers ?? [] }))
  }

  async function dropManager(id: string, profileId: string) {
    setBusy(true)
    const r = await fetch(`/api/collections/${encodeURIComponent(id)}/managers?profileId=${encodeURIComponent(profileId)}`,
      { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (r.ok) setManagers(s => ({ ...s, [id]: d.managers ?? [] }))
  }

  async function decide(c: Claim, status: 'approved' | 'declined') {
    setBusy(true)
    const r = await fetch('/api/claims', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, status, collectionId: c.collection_id, profileId: c.profile_id }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? `Claim ${status}.` : (d.error ?? 'Could not decide that.'))
    void load()
  }

  if (mine === null) return <div className="empty" style={{ marginTop: 24 }}>Loading…</div>

  if (!handle) {
    return (
      <div className="empty" style={{ marginTop: 24, textAlign: 'left' }}>
        <strong style={{ color: 'var(--ink)' }}>Sign in with X to manage a collection.</strong>
        <p className="note" style={{ margin: '8px 0 14px' }}>
          Your X account is how a collection is claimed — if OpenSea has your handle on it, the
          claim is instant.
        </p>
        <a className="btn" href="/admin">Sign in</a>
      </div>
    )
  }

  return (
    <>
      <p className="note" style={{ marginTop: -4 }}>
        Signed in as <b style={{ color: 'var(--ink)' }}>@{handle}</b>
        {operator && <> · <b style={{ color: 'var(--accent)' }}>operator</b></>}
      </p>
      {msg && <p className="warn" style={{ marginTop: 14 }}>{msg}</p>}

      {operator && claims.length > 0 && (
        <>
          <p className="heading">
            Claims waiting on you <span style={{ color: 'var(--warn)' }}>{claims.length}</span>
          </p>
          <div className="cards">
            {claims.map(c => (
              <article className="card has-action" key={c.id}>
                <div className="code">OWNERSHIP CLAIM</div>
                <h3>{c.collections?.name ?? c.collection_id}</h3>
                <div className="sub">
                  <b>@{c.profiles?.x_handle}</b> says this is theirs.
                </div>
                <div className="sub">
                  OpenSea has {c.collections?.x_handle
                    ? <b>@{c.collections.x_handle}</b>
                    : <b>no X account</b>} on file.
                </div>
                {c.evidence && <p className="act" style={{ margin: 0 }}><b>They said</b>{c.evidence}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                  <button type="button" disabled={busy} onClick={() => decide(c, 'approved')}>Approve</button>
                  <button type="button" className="ghost" disabled={busy} onClick={() => decide(c, 'declined')}>Decline</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <p className="heading">Your collections</p>
      {mine.length === 0 && (
        <div className="empty" style={{ textAlign: 'left' }}>
          <strong style={{ color: 'var(--ink)' }}>You do not manage a collection yet.</strong>
          <p className="note" style={{ margin: '8px 0 0' }}>
            Claim one below. If OpenSea has your X handle on the collection, you get it
            immediately — otherwise it goes to an operator with whatever you tell them.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {mine.map(c => {
          const patch = edits[c.id] ?? {}
          const open = openId === c.id
          const dirty = Object.keys(patch).length > 0
          return (
            <article className="pane" key={c.id} style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20 }} aria-hidden="true">{c.icon ?? '◆'}</span>
                <h3 style={{ margin: 0, flex: 1 }}>{c.name}</h3>
                <span className="tier">{c.verified_via === 'opensea-x' ? 'VERIFIED VIA X' : 'APPROVED'}</span>
                <button type="button" className="ghost" onClick={() => {
                  setOpenId(open ? null : c.id); if (!open) void loadManagers(c.id)
                }}>{open ? 'Close' : 'Edit'}</button>
              </div>

              {open && (
                <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                  {FIELDS.map(([k, label, ph]) => (
                    <label key={k} className="note">{label}<br />
                      <input
                        value={(patch[k] ?? c[k] ?? '') as string}
                        placeholder={ph}
                        onChange={e => setEdits(s => ({ ...s, [c.id]: { ...patch, [k]: e.target.value } }))}
                        style={{ width: '100%' }} />
                    </label>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" disabled={busy || !dirty} onClick={() => save(c.id)}>
                      {dirty ? 'Save changes' : 'No changes'}
                    </button>
                    <button type="button" className="ghost" disabled={busy}
                      onClick={() => setEdits(s => ({ ...s, [c.id]: {} }))}>Discard</button>
                  </div>

                  <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 12, marginTop: 4 }}>
                    <p className="note" style={{ margin: '0 0 8px' }}>
                      <b style={{ color: 'var(--ink)' }}>Who can manage this</b> — managers can edit
                      and open raffles. Only an owner can add or remove them.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      {(managers[c.id] ?? []).map(m => (
                        <span key={m.profile_id} className="tier" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          @{m.profiles?.x_handle} · {m.role}
                          {m.role === 'manager' && (
                            <button type="button" aria-label={`Remove ${m.profiles?.x_handle}`}
                              onClick={() => dropManager(c.id, m.profile_id)} disabled={busy}
                              style={{ background: 'none', boxShadow: 'none', color: 'var(--faint)', padding: '0 2px', fontSize: 14 }}>×</button>
                          )}
                        </span>
                      ))}
                    </div>
                    <form onSubmit={e => {
                      e.preventDefault()
                      const el = (e.currentTarget.elements.namedItem('who') as HTMLInputElement)
                      if (el.value.trim()) { void addManager(c.id, el.value.trim()); el.value = '' }
                    }} className="ask" style={{ margin: 0 }}>
                      <input name="who" placeholder="their X handle" aria-label="X handle to add as manager" />
                      <button disabled={busy}>Add manager</button>
                    </form>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <p className="heading">Claim a collection</p>
      <form onSubmit={claim} className="pane" style={{ padding: 18, display: 'grid', gap: 10 }}>
        <label className="note">OpenSea collection<br />
          <input value={slug} onChange={e => setSlug(e.target.value)} style={{ width: '100%' }}
            placeholder="wallstreet-market-trader-card  — or paste the full OpenSea link" />
        </label>
        <label className="note">Anything an operator should know <span>— only needed if the automatic check does not match</span><br />
          <input value={evidence} onChange={e => setEvidence(e.target.value)} style={{ width: '100%' }}
            placeholder="I run the X account, our Discord is …" />
        </label>
        <div>
          <button disabled={busy || !slug.trim()}>{busy ? 'Checking…' : 'Claim it'}</button>
        </div>
        <p className="note" style={{ margin: 0 }}>
          We ask OpenSea which X account is on the collection. If it is yours, the claim is instant
          and nobody has to approve anything. If OpenSea has nobody on file, or somebody else, it
          goes to an operator — that is not a rejection, just a question a person has to answer.
        </p>
      </form>
    </>
  )
}
