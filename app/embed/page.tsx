import Board from '../Board'

/**
 * The same board with the page furniture off, for an <iframe> on a community's
 * own site. next.config.ts sets frame-ancestors * on this route only.
 */
export default function EmbedPage() {
  return <Board embed />
}
