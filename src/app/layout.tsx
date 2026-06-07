import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "HowGamersGame — Play Free, Win Big",
  description: "Arcade-style games with a real coin economy. Play, earn, spend.",
  openGraph: {
    title: "HowGamersGame",
    description: "Arcade-style games with a real coin economy.",
    url: "https://howgamersgame.online",
    siteName: "HowGamersGame",
    locale: "en_US",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pubId = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;

  return (
    <html lang="en" className="h-full">
      <head>
        {pubId && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${pubId}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </head>
      <body className="min-h-full" style={{ background: "var(--bg-primary)" }}>
        {children}
      </body>
    </html>
  );
}
