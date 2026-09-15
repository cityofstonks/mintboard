'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * The product, running, in the hero.
 *
 * The landing page described pasting a wallet and then made you navigate
 * somewhere else to do it. A winner hit that gap today — landed, did not know
 * how the board worked, and bounced. So the first thing on the page is now the
 * thing itself, playing.
 *
 * Built as an animation rather than a recorded video on purpose: a video of a
 * UI is out of date the moment the UI changes, weighs megabytes, and cannot be
 * read by a screen reader. This weighs a few kilobytes, stays sharp on any
 * display, and the numbers in it are the real ones.
 */

const WALLET = '0x0e409c358160fd67bc3c1bd039df4b752f46ca44'
const ROWS = [
  { code: 'TOAD', name: 'Toadstools', tier: 'GTD', when: 'Thu 17 Sep · 14:00 UTC', note: 'free · blind mint' },
  { code: 'PGM', name: 'Pharaoh God Mob', tier: 'FCFS', when: 'date TBA', note: 'free · whitelist only' },
  { code: 'ASTR', name: 'Astral Sentinels', tier: 'GTD', when: 'minting now', note: '0.001 · max 1' },
]

type Phase = 'typing' | 'scanning' | 'results' | 'hold'

export default function HeroDemo() {
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState<Phase>('typing')
  const [shown, setShown] = useState(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    // Somebody who has asked not to see motion gets the finished state, not a
    // blank panel — the demo still does its job, it just does not perform.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still) { setTyped(WALLET); setPhase('results'); setShown(ROWS.length); return }

    const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)) }
    const run = () => {
      setTyped(''); setShown(0); setPhase('typing')
      const perChar = 22
      for (let i = 1; i <= WALLET.length; i++) at(i * perChar, () => setTyped(WALLET.slice(0, i)))
      const done = WALLET.length * perChar
      at(done + 260, () => setPhase('scanning'))
      at(done + 1250, () => setPhase('results'))
      ROWS.forEach((_, i) => at(done + 1350 + i * 240, () => setShown(i + 1)))
      at(done + 1350 + ROWS.length * 240 + 3600, () => setPhase('hold'))
      at(done + 1350 + ROWS.length * 240 + 4200, run)   // loop
    }
    run()
    return () => { timers.current.forEach(clearTimeout); timers.current = [] }
  }, [])

  return (
    <div className="demo" aria-label="Demonstration: pasting a wallet address reveals the mints it qualifies for">
      <div className="demo-bar">
        <span className="demo-dot" /><span className="demo-dot" /><span className="demo-dot" />
        <span className="demo-url">/board</span>
      </div>

      <div className="demo-body">
        <div className="demo-field">
          <span className="demo-caret-label">wallet</span>
          <code>{typed}<span className={phase === 'typing' ? 'demo-caret on' : 'demo-caret'} /></code>
        </div>

        <div className="demo-status" data-phase={phase}>
          {phase === 'typing' && <span className="dim">nothing signed · nothing stored</span>}
          {phase === 'scanning' && <span className="scan">reading the chain…</span>}
          {(phase === 'results' || phase === 'hold') &&
            <span className="ok">{ROWS.length} mints you qualify for</span>}
        </div>

        <ul className="demo-rows">
          {ROWS.map((r, i) => (
            <li key={r.code} className={i < shown ? 'in' : ''}>
              <span className="demo-code">{r.code}</span>
              <span className="demo-name">{r.name}</span>
              <span className="demo-tier">{r.tier}</span>
              <span className="demo-when">{r.when}</span>
              <span className="demo-note">{r.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
