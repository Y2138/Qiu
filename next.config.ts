import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: process.env.IGNORE_TS_BUILD_ERRORS === "true",
  },
  serverExternalPackages: ["pdf-parse"],
  // 图片优化配置
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
