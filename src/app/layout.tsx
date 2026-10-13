import type { Metadata } from "next";
import "./interface.css";

export const metadata: Metadata = {
  title: "FORMULA: MOBIUS",
  description: "FORMULA: MOBIUS · 本地 PVE 赛车桌游",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
