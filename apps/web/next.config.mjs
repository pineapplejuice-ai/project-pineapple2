/** The browser only ever talks to this origin; /api is proxied to the NestJS API so auth cookies stay first-party. */
const api = process.env.API_URL ?? 'http://localhost:4000';
/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  async rewrites() { return [{ source: '/api/:path*', destination: `${api}/api/:path*` }]; },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'DENY' }, { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] }];
  },
};
