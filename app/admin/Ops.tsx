'use client'
import { useEffect, useState } from 'react'

interface Ops {
  ready: boolean
  raffles: { id: string; project: string; status: string; closesAt: string | null; entries: number; withWallet: number; boostsFiled: number; boostsApproved: number }[]
  overdue: { id: string; project: string; closesAt: string; hoursLate: number; entries: number }[]
  draws: { raffleId: string; project: string; pass: number; seed: string | null; winners: number; unclaimed: number; announced: boolean }[]
  wallets: { verified: number; people: number; ordinals: number }
  spots: { list: string; onFile: number; awarded: number; short: number }[]
}

export default function Ops() {
  const [d, setD] = useState<Ops | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/ops')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? String(r.status))
        setD(await r.json())
      })
      // Distinct from "nothing is wrong": an unread page must not look calm.
      .catch(e => setErr(String(e.message ?? e)))
  }, [])

  if (err) return <div className="empty">Could not read operations — {err}. That is this page failing, not a quiet night.</div>
  if (!d) return <div className="empty">Reading…</div>

  const boostsPending = d.raffles.reduce((a, r) => a + (r.boostsFiled - r.boostsApproved), 0)
  const silent = d.draws.filter(x => !x.announced)
  const shortLists = d.spots.filter(s => s.short > 0)

  return (
    <>
      <p className="heading">Needs a person</p>
      <div className="cards" style={{ marginBottom: 8 }}>
        <article className="card" style={d.overdue.length ? { borderColor: 'var(--danger)' } : undefined}>
          <div className="code">CLOSED, NOT DRAWN</div>
          <span className="big" style={{ color: d.overdue.length ? 'var(--danger)' : undefined }}>{d.overdue.length}</span>
          <span className="sub">{d.overdue.length ? 'a box past its close with no draw looks exactly like one still open' : 'every closed box has been drawn'}</span>
        </article>
        <article className="card" style={silent.length ? { borderColor: 'var(--warn)' } : undefined}>
          <div className="code">DRAWN, NEVER ANNOUNCED</div>
          <span className="big" style={{ color: silent.length ? 'var(--warn)' : undefined }}>{silent.length}</span>
          <span className="sub">winners recorded that nobody was told about</span>
        </article>
        <article className="card" style={boostsPending ? { borderColor: 'var(--warn)' } : undefined}>
          <div className="code">BOOSTS UNJUDGED</div>
          <span className="big" style={{ color: boostsPending ? 'var(--warn)' : undefined }}>{boostsPending}</span>
          <span className="sub">people told it would be checked before the draw</span>
        </article>
        <article className="card">
          <div className="code">WALLETS VERIFIED</div>
          <span className="big">{d.wallets.verified}</span>
          <span className="sub">{d.wallets.people} people · {d.wallets.ordinals} ordinal addresses</span>
        </article>
      </div>

      {d.overdue.length > 0 && (
        <div className="cards">
          {d.overdue.map(o => (
            <article className="card" key={o.id} style={{ borderLeft: '2px solid var(--danger)' }}>
              <div className="code" style={{ color: 'var(--danger)' }}>{o.hoursLate}H LATE</div>
              <h3>{o.project}</h3>
              <span className="sub">closed {o.closesAt.slice(0, 16).replace('T', ' ')} UTC · {o.entries} entries · no draw recorded</span>
            </article>
          ))}
        </div>
      )}

      <p className="heading">Boxes</p>
      <div className="tablewrap">
        <table className="ops">
          <thead><tr><th>Project</th><th>Status</th><th>Closes</th><th>Entries</th><th>Wallet</th><th>Boosts</th></tr></thead>
          <tbody>
            {d.raffles.map(r => (
              <tr key={r.id}>
                <td>{r.project}</td>
                <td><span className="code">{r.status}</span></td>
                <td>{r.closesAt ? r.closesAt.slice(0, 16).replace('T', ' ') : '—'}</td>
                <td>{r.entries}</td>
                {/* An entrant with no wallet is a winner we cannot pay. */}
                <td className={r.withWallet < r.entries ? 'warn' : ''}>{r.withWallet}/{r.entries}</td>
                <td className={r.boostsFiled > r.boostsApproved ? 'warn' : ''}>{r.boostsApproved}/{r.boostsFiled}</td>
              </tr>
            ))}
            {!d.raffles.length && <tr><td colSpan={6}>No boxes recorded.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="heading">Draws</p>
      <div className="tablewrap">
        <table className="ops">
          <thead><tr><th>Project</th><th>Pass</th><th>Winners</th><th>Unclaimed</th><th>Announced</th><th>Seed</th></tr></thead>
          <tbody>
            {d.draws.map(x => (
              <tr key={`${x.raffleId}:${x.pass}`}>
                <td>{x.project}</td><td>{x.pass}</td><td>{x.winners}</td>
                <td className={x.unclaimed ? 'warn' : ''}>{x.unclaimed}</td>
                <td className={x.announced ? '' : 'warn'}>{x.announced ? 'yes' : 'NO'}</td>
                <td className="mono">{x.seed ? `${x.seed.slice(0, 22)}…` : '—'}</td>
              </tr>
            ))}
            {!d.draws.length && <tr><td colSpan={6}>Nothing drawn yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="heading">Spot lists {shortLists.length > 0 && <span className="code" style={{ color: 'var(--warn)' }}>{shortLists.length} short</span>}</p>
      <div className="tablewrap">
        <table className="ops">
          <thead><tr><th>List</th><th>Awarded</th><th>Addresses on file</th><th>Missing</th></tr></thead>
          <tbody>
            {d.spots.map(s => (
              <tr key={s.list}>
                <td className="mono">{s.list}</td><td>{s.awarded}</td><td>{s.onFile}</td>
                {/* Awarded minus on-file: winners we cannot deliver to. */}
                <td className={s.short ? 'warn' : ''}>{s.short || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!d.ready && (
        <p className="note" style={{ color: 'var(--warn)' }}>
          The database is not configured on this deployment, so only spot lists are shown. Everything
          above them is blank because it could not be read — not because it is empty.
        </p>
      )}
    </>
  )
}
