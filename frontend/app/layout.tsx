import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام رحلات السائقين",
  description: "إدارة رحلات ونقل الموظفين"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
