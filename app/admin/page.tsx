'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Partner, RaffleEntry, RaffleTier } from '@/lib/types'

const blank = (): RaffleEntry => ({
  id: '', project: '', kind: 'raffle', closesAt: null,
  tiers: [{ label: 'Guaranteed', count: 10, who: 'holders', drawn: true }],
  enterUrl: '', url: '', homework: '', note: '',
})

/** datetime-local wants local wall time; everything stored is ISO UTC. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(+d)) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Admin() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [list, setList] = useState<RaffleEntry[]>([])
  const [mode, setMode] = useState<string>('')
  const [draft, setDraft] = useState<RaffleEntry>(blank())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [partners, setPartners] = useState<Partner[]>([])

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/raffles')
    if (r.status === 401) { setAuthed(false); return }
    const d = await r.json()
    setList(d.raffles ?? []); setMode(d.mode ?? ''); setAuthed(true)
    const pr = await fetch('/api/partners')
    if (pr.ok) setPartners((await pr.json()).partners ?? [])
  }, [])

  useEffect(() => { void load() }, [load])

  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    const r = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const d = await r.json()
    setBusy(false)
    if (!r.ok) { setMsg(d.error ?? 'Could not sign in.'); return }
    setPassword(''); void load()
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    const r = await fetch('/api/admin/raffles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, closesAt: draft.closesAt ? new Date(draft.closesAt).toISOString() : '' }),
    })
    const d = await r.json()
    setBusy(false)
    if (!r.ok) { setMsg(d.error ?? 'Could not save.'); return }
    setMsg(`Saved "${d.raffle.project}".`); setDraft(blank()); void load()
  }

  async function remove(id: string, project: string) {
    if (!confirm(`Remove the ${project} raffle? This commits a change to your repo.`)) return
    setBusy(true)
    const r = await fetch(`/api/admin/raffles?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const d = await r.json()
    setBusy(false)
    setMsg(r.ok ? 'Removed.' : (d.error ?? 'Could not remove.'))
    void load()
  }

  async function decide(id: string, status: Partner['status']) {
    setBusy(true)
    const r = await fetch('/api/partners', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    const d = await r.json()
    setBusy(false)
    setMsg(r.ok ? `Marked ${status}.` : (d.error ?? 'Could not update.'))
    void load()
  }

  const setTier = (i: number, patch: Partial<RaffleTier>) =>
    setDraft(s => ({ ...s, tiers: s.tiers.map((t, n) => n === i ? { ...t, ...patch } : t) }))

  if (!authed) {
    return (
      <main className="wrap" style={{ maxWidth: 460 }}>
        <h1>ADMIN</h1>
        <p className="lede">Sign in to manage the raffles on this board.</p>
        <form className="ask" onSubmit={login}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="admin password" aria-label="admin password" />
          <button disabled={busy}>{busy ? '…' : 'Sign in'}</button>
        </form>
        {msg && <p className="warn" style={{ marginTop: 14 }}>{msg}</p>}
      </main>
    )
  }

  return (
    <main className="wrap">
      <h1>ADMIN <span>RAFFLES</span></h1>
      <p className="lede">
        Anything you save here is written straight to your repo as a commit, so the history of
        who changed which raffle is kept for you.
      </p>

      {mode === 'readonly' && (
        <p className="warn" style={{ marginTop: 14 }}>
          <strong>This deployment cannot save.</strong> It has no <code>GITHUB_TOKEN</code>, and a
          deployed filesystem is read-only. Set <code>GITHUB_TOKEN</code> and <code>GITHUB_REPO</code> in
          your project settings, or edit <code>data/raffles.json</code> on GitHub directly. Everything
          below still shows you what is live.
        </p>
      )}
      {mode === 'local' && (
        <p className="note" style={{ marginTop: 10 }}>Running locally — saves write <code>data/raffles.json</code> on this machine. Commit it when you are happy.</p>
      )}

      {msg && <p className="warn" style={{ marginTop: 14 }}>{msg}</p>}

      <p className="heading">On the board</p>
      {list.length === 0 && <div className="empty">No raffles yet. Add one below.</div>}
      <div className="cards">
        {list.map(r => {
          // No deadline means open-ended, which is open — not closed.
          const t = r.closesAt ? Date.parse(r.closesAt) : NaN
          const open = Number.isFinite(t) ? t > Date.now() : true
          return (
            <article className="card" key={r.id}>
              <div>
                <span className="code">{open ? 'OPEN' : 'CLOSED'}</span>{' '}
                <span className="tier">{r.kind === 'claim' ? 'CLAIM' : 'RAFFLE'}</span>
              </div>
              <h3>{r.project}</h3>
              <div className="meta">
                {r.closesAt ? `closes ${new Date(r.closesAt).toLocaleString()}` : 'no deadline — open until it fills'}
              </div>
              <div className="tiers">
                {r.tiers.map((t, i) => (
                  <span key={i}><b>{t.count === null ? '' : `${t.count} `}{t.label}</b> · {t.who} {t.drawn ? '(drawn)' : '— not a draw'}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <button type="button" onClick={() => setDraft({ ...r, closesAt: r.closesAt ? toLocalInput(r.closesAt) : '' })}>Edit</button>
                <button type="button" onClick={() => remove(r.id, r.project)} disabled={busy}
                  style={{ background: 'transparent', color: 'var(--warn)', border: '1px solid var(--warn)' }}>Remove</button>
              </div>
            </article>
          )
        })}
      </div>

      <p className="heading">
        Collections offering allocation
        {partners.some(p => p.status === 'pending') &&
          <span style={{ color: 'var(--warn)' }}> · {partners.filter(p => p.status === 'pending').length} waiting on you</span>}
      </p>
      {partners.length === 0 && <div className="empty">Nobody has applied yet. The form is at <a href="/partners#apply">/partners</a>.</div>}
      <div className="cards">
        {[...partners].sort((a, b) =>
          Number(b.status === 'pending') - Number(a.status === 'pending')
          || b.submittedAt.localeCompare(a.submittedAt)).map(p => (
          <article className="card" key={p.id}>
            <div className="code">
              {p.status === 'pending' ? 'WAITING' : p.status.toUpperCase()} · {p.chain.toUpperCase()}
              {p.supply ? ` · ${p.supply.toLocaleString()}` : ''}
            </div>
            <h3>{p.name}</h3>
            <div className="meta"><b>{p.offer}</b></div>
            <div className="sub">
              <a href={`https://x.com/${p.handle}`} target="_blank" rel="noopener">@{p.handle}</a>
              {p.mintAt ? ` · ${new Date(p.mintAt).toLocaleString()}` : ' · date TBA'}
            </div>
            {p.requirements && <div className="sub"><b>Asks for:</b> {p.requirements}</div>}
            {p.contact && <div className="sub"><b>Contact:</b> {p.contact}</div>}
            {p.note && <div className="sub">{p.note}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
              {p.status !== 'approved' && <button type="button" disabled={busy} onClick={() => decide(p.id, 'approved')}>Approve</button>}
              {p.status !== 'declined' && <button type="button" className="ghost" disabled={busy} onClick={() => decide(p.id, 'declined')}>Decline</button>}
            </div>
            {p.status === 'pending' && (
              <p className="note" style={{ margin: 0 }}>
                Open their account before approving. Everything here is their own unverified claim.
              </p>
            )}
          </article>
        ))}
      </div>

      <p className="heading">{draft.id ? `Editing ${draft.project || draft.id}` : 'Add a raffle'}</p>
      <form onSubmit={save} style={{ display: 'grid', gap: 10, maxWidth: 620 }}>
        <label>Project<br /><input value={draft.project} onChange={e => setDraft(s => ({ ...s, project: e.target.value }))} placeholder="The Furnace" style={{ width: '100%' }} /></label>
        <label>Kind<br />
          <select value={draft.kind ?? 'raffle'} onChange={e => setDraft(s => ({ ...s, kind: e.target.value as 'raffle' | 'claim' }))}>
            <option value="raffle">Raffle — you draw names when it closes</option>
            <option value="claim">Claim — anyone who qualifies just takes a spot</option>
          </select>
        </label>
        <label>Entry closes <span className="note">— leave blank if it runs until it fills</span><br />
          <input type="datetime-local" value={draft.closesAt ?? ''} onChange={e => setDraft(s => ({ ...s, closesAt: e.target.value || null }))} style={{ width: '100%' }} /></label>
        <label>Link straight to the claim page <span className="note">— for a claim, instead of your announcement</span><br />
          <input value={draft.url ?? ''} onChange={e => setDraft(s => ({ ...s, url: e.target.value }))} placeholder="https://theproject.xyz/claim" style={{ width: '100%' }} /></label>
        <label>Link people click to enter<br /><input value={draft.enterUrl ?? ''} onChange={e => setDraft(s => ({ ...s, enterUrl: e.target.value }))} placeholder="https://discord.com/channels/…" style={{ width: '100%' }} /></label>
        <label>What entrants must do<br /><input value={draft.homework ?? ''} onChange={e => setDraft(s => ({ ...s, homework: e.target.value }))} placeholder="Follow, repost and comment — then file the link" style={{ width: '100%' }} /></label>
        <label>Note<br /><input value={draft.note ?? ''} onChange={e => setDraft(s => ({ ...s, note: e.target.value }))} placeholder="3,232 on Robinhood Chain. Price and date TBA." style={{ width: '100%' }} /></label>

        <p className="heading" style={{ margin: '6px 0 0' }}>Tiers</p>
        {draft.tiers.map((t, i) => (
          <div key={i} className="tier-row">
            <input value={t.label} onChange={e => setTier(i, { label: e.target.value })} placeholder="Guaranteed" />
            <input value={t.count ?? ''} onChange={e => setTier(i, { count: e.target.value === '' ? null : Number(e.target.value) })} placeholder="all" title="Leave blank for an uncapped tier" />
            <input value={t.who} onChange={e => setTier(i, { who: e.target.value })} placeholder="Key Masters" />
            <label className="note" style={{ whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={t.drawn} onChange={e => setTier(i, { drawn: e.target.checked })} /> drawn
            </label>
            <button type="button" onClick={() => setDraft(s => ({ ...s, tiers: s.tiers.filter((_, n) => n !== i) }))}
              style={{ background: 'transparent', color: 'var(--faint)', border: '1px solid var(--edge)' }}>×</button>
          </div>
        ))}
        <p className="note">Leave the count blank for a tier nobody is drawn for — a whitelist everyone who qualifies gets.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setDraft(s => ({ ...s, tiers: [...s.tiers, { label: 'First come first served', count: null, who: 'every holder', drawn: false }] }))}
            style={{ background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)' }}>Add tier</button>
          <button disabled={busy || mode === 'readonly'}>{busy ? 'Saving…' : draft.id ? 'Save changes' : 'Add raffle'}</button>
          {draft.id !== '' && <button type="button" onClick={() => setDraft(blank())}
            style={{ background: 'transparent', color: 'var(--faint)', border: '1px solid var(--edge)' }}>Cancel</button>}
        </div>
      </form>

      <p className="note" style={{ marginTop: 26 }}>
        Closed raffles drop off the public board on their own — you do not have to remove them.
      </p>
    </main>
  )
}
