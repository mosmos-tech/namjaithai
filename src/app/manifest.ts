import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "น้ำใจไทย SOS",
    short_name: "น้ำใจไทย",
    description: "แจ้งขอความช่วยเหลือ สายด่วน และคู่มือเอาตัวรอด",
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F8FC",
    theme_color: "#1F6FD1",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
