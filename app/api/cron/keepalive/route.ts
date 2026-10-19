import { NextRequest, NextResponse } from "next/server";
import { pingSupabaseDatabase } from "@/lib/persistence";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron Keep-Alive Route
 * Triggered automatically by Vercel Cron to prevent Supabase Free Tier auto-pause.
 * Can also be called manually or by external ping services.
 */
export async function GET(req: NextRequest) {
  // Optional security: verify CRON_SECRET if provided in environment
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await pingSupabaseDatabase();

  return NextResponse.json({
    status: result.success ? "healthy" : "warning",
    service: "Lighthouse PTC Supabase Keep-Alive",
    ...result,
  });
}
