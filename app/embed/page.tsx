import Board from '../Board'
import EmbedHeight from './EmbedHeight'

/**
 * The same board with the page furniture off, for an <iframe> on a community's
 * own site. next.config.ts sets frame-ancestors * on this route only.
 */
export default function EmbedPage() {
  return (
    <>
      <EmbedHeight />
      <Board embed />
    </>
  )
}
