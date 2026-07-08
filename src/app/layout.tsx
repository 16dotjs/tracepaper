import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "tracepaer — understand any repo in minutes",
  description:
    "AI-powered gitHub repo onboarding. paste a repo, get a plain-english architecture breakdown.",
  openGraph: {
    type: "website",
    siteName: "tracepaper",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${ibmPlexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
