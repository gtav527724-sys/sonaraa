import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Unbounded } from "next/font/google";
import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";
import "./globals.css";

const display = Unbounded({
  subsets: ["latin"],
  variable: "--font-unbounded",
  weight: ["400", "600", "700", "800"],
});

const body = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SONARA — Your Music, Everywhere",
  description:
    "SONARA is your personal music streaming app. Stream your catalog, build playlists, like songs and take your sound everywhere.",
  manifest: "/manifest.webmanifest",
  applicationName: "SONARA",
  icons: [{ rel: "icon", url: "/icons/icon.png", type: "image/png" }],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SONARA",
  },
};

export const viewport: Viewport = {
  themeColor: "#050508",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
