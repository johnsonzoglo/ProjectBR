import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./rewards.css";
import "./pages.css";
import "./modules.css";
import "./reference-ui.css";
import "./admin/admin.css";
import "./landing.css";

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
    title: "Rewardly — Make your spare time rewarding",
    description: "Discover approved tasks, build verified points, and keep every reward clearly in view.",
    openGraph: { title: "Make your spare time rewarding.", description: "Small steps. Clear rewards.", images: [{ url: `${origin}/og-landing.png`, width: 1536, height: 1024 }] },
    twitter: { card: "summary_large_image", title: "Make your spare time rewarding.", images: [`${origin}/og-landing.png`] },
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
