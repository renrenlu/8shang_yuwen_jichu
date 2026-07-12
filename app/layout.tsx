import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const image = new URL("/og.jpg", base).toString();

  return {
    metadataBase: base,
    title: "语文必背 · 互动练习册",
    description: "8 个资料板块，852 道初中语文基础知识题；不重复抽题、综合练习与错题再练。",
    openGraph: {
      title: "语文必背 · 互动练习册",
      description: "852 道题 · 8 个板块 · 不重复抽题",
      type: "website",
      images: [{ url: image, width: 1536, height: 1024, alt: "语文必背互动练习册" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "语文必背 · 互动练习册",
      description: "852 道题 · 8 个板块 · 不重复抽题",
      images: [image],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
