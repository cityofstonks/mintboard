/**
 * Reading "50 GTD, 100 FCFS" into two numbers.
 *
 * Its own file with no node imports, because both sides need it: the admin
 * page (a client component) shows the operator what it guessed, and the
 * server sends whatever they corrected it to. Sharing the function is what
 * keeps the preview honest — a second copy would drift, and the number on
 * screen would stop being the number posted.
 */
export function readOffer(offer: string): { gtd: number; fcfs: number } {
  const text = (offer ?? '').toLowerCase()
  const find = (re: RegExp) => { const m = re.exec(text); return m ? Number(m[1]) : 0 }
  const gtd = find(/(\d{1,4})\s*(?:x\s*)?(?:gtd|guaranteed|godlist|og\b)/)
  const fcfs = find(/(\d{1,4})\s*(?:x\s*)?(?:fcfs|first[\s-]?come|raffle|wl\b|whitelist)/)
  // A bare number with no tier word is a total, and a total we cannot split is
  // safest treated as first-come — the tier that promises least.
  if (!gtd && !fcfs) return { gtd: 0, fcfs: find(/(\d{1,4})/) }
  return { gtd, fcfs }
}
