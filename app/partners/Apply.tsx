'use client'
import { useState } from 'react'

const FIELDS = [
  ['name', 'Collection name', 'Astral Sentinels', true],
  ['handle', 'X handle', 'AstralSentinels', true],
  ['offer', 'What you are offering', '50 GTD and 100 FCFS', true],
  ['chain', 'Chain', 'Ethereum', false],
  ['supply', 'Supply', '4444', false],
  ['mintAt', 'Mint date and time', '', false],
  ['url', 'Website or mint page', 'https://…', false],
  ['requirements', 'What holders must do', 'Follow, repost and comment', false],
  ['contact', 'How we reach you', 'discord: yourname', false],
] as const

export default function Apply() {
  const [form, setForm] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState('busy'); setError('')
    const r = await fetch('/api/partners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error ?? 'Could not send that.'); setState('idle'); return }
    setState('done')
  }

  if (state === 'done') {
    return (
      <div className="pane" style={{ padding: 28 }}>
        <h2>Sent.</h2>
        <p className="lede" style={{ margin: 0 }}>
          A person reads every one of these before it goes on the directory, so it will not appear
          instantly. If what you sent checks out against your own account, it goes up.
        </p>
      </div>
    )
  }

  return (
    <form className="pane" onSubmit={submit} style={{ padding: 24, display: 'grid', gap: 14 }}>
      {FIELDS.map(([key, label, placeholder, required]) => (
        <label key={key} style={{ display: 'grid', gap: 6, fontSize: 13.5 }}>
          <span style={{ color: 'var(--muted)' }}>
            {label}{required && <span style={{ color: 'var(--accent)' }}> *</span>}
          </span>
          <input
            type={key === 'mintAt' ? 'datetime-local' : key === 'supply' ? 'number' : 'text'}
            value={form[key] ?? ''} placeholder={placeholder}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          />
        </label>
      ))}
      <label style={{ display: 'grid', gap: 6, fontSize: 13.5 }}>
        <span style={{ color: 'var(--muted)' }}>Anything else</span>
        <textarea rows={3} value={form.note ?? ''} placeholder="What makes it worth their holders' time."
          onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
      </label>

      {/* Honeypot. Hidden from people, irresistible to naive bots. */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        value={form.website ?? ''} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }} />

      {error && <p className="act" style={{ margin: 0 }}>{error}</p>}
      <div>
        <button disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Submit for review'}</button>
      </div>
      <p className="note" style={{ margin: 0 }}>
        Nothing is published until an operator approves it. Your contact details are never shown
        publicly — they go to the operator so a community can reach you.
      </p>
    </form>
  )
}
