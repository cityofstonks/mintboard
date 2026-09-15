/**
 * Reading a Bitcoin address well enough to trust an inscription to it.
 *
 * This matters more here than an EVM address does. An EVM chain will happily
 * tell you a balance for any well-formed string, and a mistyped one usually
 * just holds nothing. An inscription sent to the wrong kind of Bitcoin
 * address, or to an address with a typo that still looks plausible, is gone —
 * there is no support desk and no reversal.
 *
 * So the whole point of this file is to refuse confidently. bech32 carries a
 * checksum precisely so a single mistyped character can be caught before
 * anybody spends anything, and checking it is pure arithmetic — no indexer, no
 * API key, nothing that can be down at the wrong moment.
 *
 * BIP-173 (bech32, witness v0) and BIP-350 (bech32m, witness v1+).
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const BECH32 = 1
const BECH32M = 0x2bc830a3

const polymod = (values: number[]): number => {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i]
  }
  return chk
}

const expandHrp = (hrp: string): number[] => [
  ...[...hrp].map(c => c.charCodeAt(0) >> 5), 0, ...[...hrp].map(c => c.charCodeAt(0) & 31),
]

/** 5-bit groups back to bytes, rejecting the padding a valid address never has. */
function fromWords(words: number[]): number[] | null {
  let acc = 0, bits = 0
  const out: number[] = []
  for (const w of words) {
    if (w < 0 || w >> 5 !== 0) return null
    acc = (acc << 5) | w
    bits += 5
    while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff) }
  }
  // Leftover bits must be fewer than 5 and all zero, or someone has appended
  // something to an otherwise valid address.
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) return null
  return out
}

export type AddressKind = 'taproot' | 'segwit' | 'legacy' | 'invalid'

export interface Address {
  kind: AddressKind
  /** True only for a taproot address that passes its checksum. */
  canHoldInscription: boolean
  witnessVersion?: number
  why?: string
}

/**
 * Classify an address, and say plainly whether an inscription can live there.
 *
 * `canHoldInscription` is the only field callers should gate on. A bc1q
 * address is perfectly valid Bitcoin and completely wrong for this — that is
 * the mistake people actually make, so it gets its own answer rather than a
 * flat "invalid" that reads like a typo.
 */
export function readAddress(input: string): Address {
  const raw = input.trim()
  if (!raw) return { kind: 'invalid', canHoldInscription: false, why: 'empty' }

  // Legacy and P2SH. Valid Bitcoin, cannot be a taproot output.
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(raw)) {
    return { kind: 'legacy', canHoldInscription: false, why: 'a legacy address cannot hold an inscription' }
  }

  // bech32 is case-insensitive but must not be mixed case.
  if (raw !== raw.toLowerCase() && raw !== raw.toUpperCase()) {
    return { kind: 'invalid', canHoldInscription: false, why: 'mixed upper and lower case' }
  }
  const s = raw.toLowerCase()
  const sep = s.lastIndexOf('1')
  if (sep < 1 || sep + 7 > s.length || s.length > 90) {
    return { kind: 'invalid', canHoldInscription: false, why: 'not a bech32 address' }
  }
  const hrp = s.slice(0, sep)
  if (hrp !== 'bc' && hrp !== 'tb' && hrp !== 'bcrt') {
    return { kind: 'invalid', canHoldInscription: false, why: `unknown prefix "${hrp}"` }
  }

  const data: number[] = []
  for (const c of s.slice(sep + 1)) {
    const i = CHARSET.indexOf(c)
    // b, i, o and 1 are deliberately absent from the charset so they cannot be
    // confused with 6, 1, 0 and l when read aloud or copied by hand.
    if (i === -1) return { kind: 'invalid', canHoldInscription: false, why: `"${c}" is not a bech32 character` }
    data.push(i)
  }

  const version = data[0]
  if (version > 16) return { kind: 'invalid', canHoldInscription: false, why: 'unknown witness version' }
  const want = version === 0 ? BECH32 : BECH32M
  if (polymod([...expandHrp(hrp), ...data]) !== want) {
    // The checksum is the whole reason this file exists: a single wrong
    // character lands here rather than on the blockchain.
    return { kind: 'invalid', canHoldInscription: false, why: 'checksum does not match — check for a typo' }
  }

  const program = fromWords(data.slice(1, -6))
  if (!program) return { kind: 'invalid', canHoldInscription: false, why: 'malformed witness program' }

  if (version === 0) {
    if (program.length !== 20 && program.length !== 32) {
      return { kind: 'invalid', canHoldInscription: false, why: 'wrong length for a segwit address' }
    }
    return {
      kind: 'segwit', canHoldInscription: false, witnessVersion: 0,
      why: 'this is a bc1q segwit address — an inscription sent here is lost. A taproot address starts bc1p.',
    }
  }
  if (version === 1) {
    if (program.length !== 32) {
      return { kind: 'invalid', canHoldInscription: false, why: 'a taproot program must be 32 bytes' }
    }
    return { kind: 'taproot', canHoldInscription: true, witnessVersion: 1 }
  }
  return {
    kind: 'invalid', canHoldInscription: false, witnessVersion: version,
    why: `witness version ${version} is not a taproot address`,
  }
}

export const isTaproot = (s: string) => readAddress(s).canHoldInscription
