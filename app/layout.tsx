import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { UserMenu } from "@/components/user-menu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Chicago Elite 11U - Moore",
    template: "%s | Chicago Elite 11U",
  },
  description: "Game day dashboard for Chicago Elite 11U - Moore baseball",
  manifest: "/manifest.json",
  applicationName: "Chicago Elite 11U",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Elite 11U",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "Chicago Elite 11U - Moore",
    description: "Game day dashboard for Chicago Elite 11U - Moore baseball",
    siteName: "Chicago Elite 11U",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-black min-h-screen`}
      >
        <header className="border-b border-slate-800 bg-black px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <h1 className="text-slate-100 font-semibold text-sm sm:text-base">
              Chicago Elite 11U - Moore
            </h1>
            <UserMenu />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
