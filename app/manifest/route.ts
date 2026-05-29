import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let name = "On Deck";
  let themeColor = "#000000";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: memberships } = await supabase
        .from("memberships")
        .select("organizations:organization_id ( name, primary_color )")
        .eq("user_id", user.id)
        .eq("status", "approved")
        .limit(1);
      const m = memberships?.[0];
      const orgRow = m
        ? Array.isArray(m.organizations)
          ? m.organizations[0]
          : m.organizations
        : null;
      if (orgRow?.name) name = orgRow.name;
      if (orgRow?.primary_color && orgRow.primary_color.trim()) {
        themeColor = orgRow.primary_color;
      }
    }
  } catch {
    // fall back to defaults
  }

  const manifest = {
    name,
    short_name: name,
    description: `Game day dashboard for ${name}`,
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: themeColor,
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };

  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
