import type { Metadata } from 'next'
import config from '@/mintboard.config'
import './globals.css'

export const metadata: Metadata = {
  title: `${config.name} — the board`,
  description: config.tagline,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{
      ['--accent' as string]: config.accent,
      ['--accent-2' as string]: config.accent2,
    }}>
      <body>{children}</body>
    </html>
  )
}
