import type { NextConfig } from "next";

/**
 * 管理面同源约定(architecture B4.1):web 只调 `/api/*` 相对路径,
 * 由 Next 反代到 core-app——better-auth session cookie 天然同源,无 CORS。
 * 生产部署时由前置网关/LB 做同样的路径路由,此处只服务本地开发。
 */
const CORE_APP_URL = process.env.CORE_APP_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${CORE_APP_URL}/api/:path*` }];
  },
};

export default nextConfig;
