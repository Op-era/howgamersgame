import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'dstxhnszvykjsavdwiuf.supabase.co' },
    ],
  },
};

export default nextConfig;
