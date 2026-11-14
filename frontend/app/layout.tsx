import type { Metadata } from "next";
import "./globals.css";
import NativeUpdater from "@/components/NativeUpdater";

export const metadata: Metadata = {
  title: "نظام رحلات السائقين",
  description: "إدارة رحلات ونقل الموظفين"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <NativeUpdater />
        {children}
      </body>
    </html>
  );
}
