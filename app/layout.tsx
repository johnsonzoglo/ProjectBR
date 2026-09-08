import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;
  return {
    title: "Rewardly — Make your time count",
    description: "Small steps. Clear rewards. Explore Rewardly and create your account to start your journey.",
    openGraph: { title: "Rewardly — A little effort. A little more.", description: "Make your time count.", images: [{ url: `${origin}/og.png`, width: 1536, height: 1024 }] },
    twitter: { card: "summary_large_image", title: "Rewardly — Make your time count", images: [`${origin}/og.png`] },
    robots: { index: false, follow: false },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
