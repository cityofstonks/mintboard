import type { NextConfig } from 'next'

const config: NextConfig = {
  // The embed route is meant to be iframed by the community's own site, so
  // the default DENY would defeat the entire point of shipping it.
  async headers() {
    return [{
      source: '/embed',
      headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
    }]
  },
}
export default config
