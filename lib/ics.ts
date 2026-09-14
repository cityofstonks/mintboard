import type { BoardRow } from './types'

/** ICS escaping. Order matters: the backslash has to go first. */
const esc = (s: string) => s
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n')

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/**
 * Fold at 75 OCTETS, continuing with a leading space.
 *
 * Not 75 characters. A note carrying an em dash spends three bytes on one
 * character, so folding by length splits a UTF-8 sequence and parsers drop
 * the rest of the line — silently truncating exactly the entries with the
 * richest descriptions.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const dec = new TextDecoder()
  const out: string[] = []
  let start = 0
  while (start < bytes.length) {
    let take = Math.min(out.length === 0 ? 75 : 74, bytes.length - start)
    // Never split a multi-byte character: back off to a lead byte.
    while (take > 1 && (bytes[start + take] & 0xC0) === 0x80) take--
    out.push(dec.decode(bytes.subarray(start, start + take)))
    start += take
  }
  return out.join('\r\n ')
}

const HOUR = 3600_000

export function boardIcs(rows: BoardRow[], name: string, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Mintboard//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
  ]
  for (const r of rows) {
    // A mint with no date is real and belongs on the board, but it cannot be
    // an event: an entry at an invented time looks like knowledge.
    if (!r.when) continue
    const start = new Date(r.when)
    if (Number.isNaN(start.getTime())) continue
    const end = r.until && !Number.isNaN(Date.parse(r.until))
      ? new Date(r.until) : new Date(start.getTime() + HOUR)
    const mine = r.phases.find(p => p.yours)
    const price = mine?.price === null ? 'free' : mine?.price ? `${mine.price} each` : null
    const body = [
      `You hold a ${r.tier} spot.`,
      r.reasons.length ? `Why: ${r.reasons.join('; ')}.` : '',
      price ? `Price: ${price}.` : '',
      mine?.limit ? `Limit: ${mine.limit} per wallet.` : '',
      r.actions.length ? `STILL TO DO: ${r.actions.join(' ')}` : '',
      r.note ?? '', r.url ?? '',
    ].filter(Boolean).join('\n')
    lines.push(
      'BEGIN:VEVENT',
      // Stable per mint and tier, so re-importing updates in place rather
      // than leaving the reader with four copies of the same mint.
      `UID:${r.code.toLowerCase()}-${r.tier.toLowerCase()}@mintboard`,
      `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${esc(`${r.name} — ${r.tier} mint`)}`),
      fold(`DESCRIPTION:${esc(body)}`),
      ...(r.url ? [fold(`URL:${esc(r.url)}`)] : []),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M',
      fold(`DESCRIPTION:${esc(`${r.name} ${r.tier} mint opens in 15 minutes`)}`),
      'END:VALARM', 'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  // CRLF throughout, and a trailing one. Parsers that are strict about this
  // fail by importing nothing at all.
  return lines.join('\r\n') + '\r\n'
}
