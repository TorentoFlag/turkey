import type { Metadata } from "next";
import type { ReactNode } from "react";

import { siteConfig } from "@/config/site";

import "./globals.css";

const publicTitle = siteConfig.publicBrandName ?? "Туристический сервис по Турции";
const publicOrigin = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  title: publicTitle,
  description: siteConfig.description,
  metadataBase: publicOrigin ? new URL(publicOrigin) : undefined,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={siteConfig.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
