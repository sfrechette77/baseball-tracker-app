import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TeamProvider } from "@/components/team-context";
import { OrgProvider } from "@/components/org-context";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/header";
import { UserMenu } from "@/components/user-menu";
import { AppShell } from "@/components/app-shell";
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
  let orgName = "On Deck";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: memberships } = await supabase
        .from("memberships")
        .select("organizations:organization_id ( name )")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .limit(1);
      const m = memberships?.[0];
      const orgRow = m
        ? Array.isArray(m.organizations)
          ? m.organizations[0]
          : m.organizations
        : null;
      if (orgRow?.name) orgName = orgRow.name;
    }
  } catch {
    // Fall back to the default name.
  }

  return {
    title: {
      default: orgName,
      template: `%s | ${orgName}`,
    },
    description: `Game day dashboard for ${orgName}`,
    applicationName: orgName,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: orgName,
    },
    formatDetection: {
      telephone: false,
    },
    openGraph: {
      title: orgName,
      description: `Game day dashboard for ${orgName}`,
      siteName: orgName,
      type: "website",
    },
    icons: {
      icon: [
        { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }],
    },
  };
}
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
       <OrgProvider>
        <TeamProvider>
          <AppShell userMenu={<UserMenu />}>{children}</AppShell>
        </TeamProvider>
       </OrgProvider>
      </body>
    </html>
  );
}
