/**
 * A small throttle for the endpoints anybody can reach.
 *
 * /api/partners accepts submissions from the public and every accepted one
 * becomes a COMMIT. Without a brake, a loop turns a community's repository
 * into thousands of junk commits and burns their GitHub rate limit with it.
 *
 * Per instance, in memory, on purpose. A serverless deployment runs several
 * instances so a determined attacker gets a multiple of this — which is the
 * honest limitation and is still the difference between a script running
 * unbounded and one that has to work at it. Anything stronger wants Redis,
 * and the point of this tool is that it needs no services.
 */
const hits = new Map<string, number[]>()

export function tooMany(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs)
  if (recent.length >= max) { hits.set(key, recent); return true }
  recent.push(now)
  hits.set(key, recent)
  // Keep the map from growing forever on a long-lived instance.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k)
  }
  return false
}

/** Best available caller id. Spoofable, which is why the limit is generous. */
export function callerOf(req: Request): string {
  const h = req.headers
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim()
    || h.get('x-real-ip') || 'unknown'
}
