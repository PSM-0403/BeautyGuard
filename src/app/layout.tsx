import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "화장품 성분 트렌드 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
