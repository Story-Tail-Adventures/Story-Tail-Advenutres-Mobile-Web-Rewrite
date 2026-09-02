import type { Metadata, Viewport } from "next";
import { fontVariables } from "./fonts";
import { ThemeScript } from "@/components/ThemeScript";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Story-Tail Adventures",
    template: "%s · Story-Tail Adventures",
  },
  description:
    "Trips planned by someone who has done this a hundred times — so you can rest when you get there.",
  applicationName: "Story-Tail Adventures",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    // --brand-cream, the light background
    { media: "(prefers-color-scheme: light)", color: "#FBF6EE" },
    // dark --md-bg, the tropical-dark background
    { media: "(prefers-color-scheme: dark)", color: "#050D1A" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // ThemeScript mutates className before hydration — see components/ThemeScript.tsx
      suppressHydrationWarning
      className={`${fontVariables} h-full`}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
