import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // TF-66: หน้าเลือกประเภทเหตุ (TF-46) รวมเข้าขั้นที่ 1 ของฟอร์มแล้ว — ลิงก์เก่าพาไปฟอร์มเลย
  async redirects() {
    return [{ source: "/incidents", destination: "/request", permanent: false }];
  },
  async headers() {
    return [
      // TF-77: ทุกหน้าส่งให้เว็บอื่นได้แค่โดเมน ไม่ส่ง path/query (กัน token ใน URL รั่ว)
      // หน้าติดตามเคสตั้ง strict-origin เพิ่มเองใน metadata — ห้ามใช้ no-referrer เพราะ OSM บังคับ Referer
      {
        source: "/:path*",
        headers: [{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
