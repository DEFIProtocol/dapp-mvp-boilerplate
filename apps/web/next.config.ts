/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${(process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;