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
import "./responsive-updates.css";
import "./user-neon.css";
import "./promotion-mobile.css";
import "./admin/operations.css";
import "./phone-tasks.css";
import "./user-portal-polish.css";
import "./admin/redesign.css";

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
    title: "Rewardly — Turn spare moments into something more",
    description: "Complete straightforward online tasks, share what you know, and build clearly tracked rewards at your own pace.",
    openGraph: { title: "Turn spare moments into something more.", description: "Small tasks. Real momentum.", images: [{ url: `${origin}/og.png`, width: 1536, height: 1024 }] },
    twitter: { card: "summary_large_image", title: "Turn spare moments into something more.", images: [`${origin}/og.png`] },
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
