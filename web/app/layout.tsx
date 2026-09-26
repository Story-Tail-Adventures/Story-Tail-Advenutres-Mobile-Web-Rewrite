import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import { AuthChromeScript } from "@/components/AuthChromeScript";
import { ThemeScript } from "@/components/ThemeScript";
import { env } from "@/lib/env";
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute URLs for canonical / Open Graph / sitemap come from NEXT_PUBLIC_SITE_URL.
  metadataBase: new URL(env.siteUrl),
  title: {
    default: "Story-Tail Adventures",
    template: "%s · Story-Tail Adventures",
  },
  description:
    "Trips planned by someone who has done this a hundred times — so you can rest when you get there.",
  applicationName: "Story-Tail Adventures",
  openGraph: {
    siteName: "Story-Tail Adventures",
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  // The static pair, correct for anyone who has not used the top bar's toggle. These
  // match on the OS, so ThemeScript rewrites BOTH of them when an explicit choice is
  // stored — see applyScheme in lib/theme.ts. The hexes come from there so the script,
  // the toggle and this export cannot drift.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR_DARK },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // ThemeScript mutates className and AuthChromeScript sets an attribute, both before
      // hydration — see components/ThemeScript.tsx and components/AuthChromeScript.tsx
      suppressHydrationWarning
      className={`${fontVariables} h-full`}
    >
      <head>
        <ThemeScript />
        <AuthChromeScript />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
