import type { Metadata } from "next";
import "./globals.css";
import { publicPath } from "./site-paths";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://yuwen-practice-852.renren49.chatgpt.site/";
const metadataBase = new URL(siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
const image = new URL(publicPath("/og-simple.jpg"), metadataBase.origin).toString();

export const metadata: Metadata = {
  metadataBase,
  title: "语文必背 · 互动练习册",
  description: "10 个资料板块，1055 道初中语文基础知识题；不重复抽题、综合练习与错题再练。",
  openGraph: {
    title: "语文必背 · 互动练习册",
    description: "1055 道题 · 10 个板块 · 不重复抽题",
    type: "website",
    images: [{ url: image, width: 1536, height: 1024, alt: "语文必背互动练习册" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "语文必背 · 互动练习册",
    description: "1055 道题 · 10 个板块 · 不重复抽题",
    images: [image],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
