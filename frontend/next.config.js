/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许前端在开发时把 /api/* 请求转发到后端 FastAPI（端口 8000）
  // 这样前端不需要写完整地址，直接 fetch("/api/health") 就行
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
