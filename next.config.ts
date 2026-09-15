import type { NextConfig } from 'next'

const config: NextConfig = {
  /*
   * Standalone build, for running in a container.
   *
   * Next traces exactly the files each route actually needs and emits a
   * self-contained server, so the image ships without node_modules. On Vercel
   * this is ignored; it only matters when something else does the hosting.
   */
  output: 'standalone',

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
