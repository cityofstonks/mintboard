'use client'
import { useState } from 'react'

interface Result {
  address: string; kind: string; ok: boolean; why?: string
  chain?: { funded: number; spent: number; txs: number } | null
  unused?: boolean | null
}

export default function Checker() {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const check = async (e: React.FormEvent) => {
    e.preventDefault()
    const a = value.trim()
    if (!a) return
    setBusy(true); setErr(null); setRes(null)
    try {
      const r = await fetch(`/api/ordinals?address=${encodeURIComponent(a)}`)
      if (!r.ok && r.status !== 200) throw new Error(String(r.status))
      setRes(await r.json())
    } catch {
      // Distinct from a bad address: the address might be perfect and the
      // check still not have happened.
      setErr('Could not run the check just now. That says nothing about the address — try again.')
    } finally { setBusy(false) }
  }

  return (
    <>
      <form onSubmit={check} className="checker">
        <input
          value={value} onChange={e => setValue(e.target.value)}
          placeholder="bc1p…" spellCheck={false} autoComplete="off"
          aria-label="Bitcoin taproot address"
        />
        <button type="submit" disabled={busy || !value.trim()}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>

      {err && <p className="verdict bad">{err}</p>}

      {res && !res.ok && (
        <div className="verdict bad">
          <strong>Do not use this address.</strong>
          <p>{res.why}</p>
          {res.kind === 'segwit' && (
            <p className="sub">
              A bc1q address is real Bitcoin and completely wrong for an inscription. Your wallet
              can almost certainly show you a taproot address as well — it starts <code>bc1p</code>.
            </p>
          )}
        </div>
      )}

      {res && res.ok && (
        <div className="verdict good">
          <strong>Valid taproot address.</strong>
          <p>The checksum matches, so there is no typo in it, and it is the right type to hold an
            inscription.</p>
          {res.chain === null
            ? <p className="sub">Could not reach a Bitcoin node to see whether it has been used.
                That is about us, not about the address.</p>
            : res.unused
              ? <p className="sub">It has never been used on chain. That is fine for a fresh
                  wallet — just make sure it is one you control and can still open.</p>
              : <p className="sub">{res.chain!.txs.toLocaleString()} transactions on chain, so it is
                  a live address.</p>}
          <p className="sub">Inscription counts are not shown: every free ordinals indexer now
            requires an API key. This checks the address, not its contents.</p>
        </div>
      )}
    </>
  )
}
