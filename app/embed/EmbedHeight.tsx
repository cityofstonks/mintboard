'use client'
import { useEffect } from 'react'

/**
 * Tell the host page how tall we are.
 *
 * An iframe cannot size itself, so the usual advice is to guess a height and
 * live with either a scrollbar or a slab of dead space. The board's height
 * depends on how many mints a wallet qualifies for, which the host cannot
 * know — so it posts its height on every change and the host resizes.
 *
 * A host that ignores the message loses nothing: the documented snippet has a
 * sensible fixed height, and this only improves on it.
 */
export default function EmbedHeight() {
  useEffect(() => {
    const send = () => {
      const h = Math.ceil(document.documentElement.scrollHeight)
      // targetOrigin '*' on purpose: the whole point is that any community
      // can embed this, and the payload is a number with no secrets in it.
      window.parent?.postMessage({ type: 'mintboard:height', height: h }, '*')
    }
    send()
    const ro = new ResizeObserver(send)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [])
  return null
}
