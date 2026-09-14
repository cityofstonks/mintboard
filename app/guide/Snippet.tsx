'use client'
import { useState } from 'react'

/** A code block you can take in one click. Nobody retypes JSON correctly. */
export default function Snippet({ code, label }: { code: string; label: string }) {
  const [took, setTook] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border)', background: '#04060a', margin: '12px 0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
        <span className="note" style={{ letterSpacing: '.12em', textTransform: 'uppercase', fontSize: 10 }}>{label}</span>
        <button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(code); setTook(true); setTimeout(() => setTook(false), 1600) } catch {}
        }} style={{ background: 'transparent', color: took ? 'var(--live)' : 'var(--accent)',
          border: '1px solid currentColor', padding: '4px 10px', fontSize: 10 }}>
          {took ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '12px 14px', overflowX: 'auto', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)' }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}
