import { createPublicKey, verify } from 'node:crypto'

/**
 * Proving an interaction really came from Discord.
 *
 * Discord signs every request with Ed25519 over `timestamp + body`. Without
 * checking it, the endpoint is a public URL that anybody can POST a fake
 * button press to — entering a raffle as somebody else, or as a user id that
 * does not exist. Discord also refuses to save an endpoint that does not
 * reject a bad signature, so getting this wrong fails loudly at setup rather
 * than quietly in production. That is the one mercy here.
 *
 * Raw key bytes are wrapped in the SPKI DER prefix for Ed25519 so Node will
 * take them; Discord hands out the key as bare hex.
 */
const DER = Buffer.from('302a300506032b6570032100', 'hex')

export function verifyInteraction(
  rawBody: string,
  signatureHex: string,
  timestamp: string,
  publicKeyHex: string,
): boolean {
  if (!rawBody || !signatureHex || !timestamp || !publicKeyHex) return false
  if (!/^[0-9a-f]{128}$/i.test(signatureHex)) return false
  if (!/^[0-9a-f]{64}$/i.test(publicKeyHex)) return false
  try {
    const key = createPublicKey({
      key: Buffer.concat([DER, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der', type: 'spki',
    })
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signatureHex, 'hex'))
  } catch {
    // A malformed key or signature is a failed verification, never a thrown
    // request — an exception here would be a 500, and Discord reads a 500 as
    // "try again" rather than "no".
    return false
  }
}

/** Interaction types we care about. */
export const PING = 1
export const APPLICATION_COMMAND = 2
export const MESSAGE_COMPONENT = 3
export const MODAL_SUBMIT = 5

/** Reply types. */
export const PONG = 1
export const CHANNEL_MESSAGE = 4
export const DEFERRED_UPDATE = 6
export const MODAL = 9

/** Only the person who pressed sees it. */
export const EPHEMERAL = 64
