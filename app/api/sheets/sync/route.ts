import { NextRequest, NextResponse } from "next/server";
import { syncSheetsData, getReservations, getBlockedSlots } from "@/lib/sheets";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const force = searchParams.get("force") === "true";

    const data = await syncSheetsData(force);
    const config = getConfig();

    return NextResponse.json({
      success: true,
      config,
      teachers: data.teachers,
      timeSlots: data.timeSlots,
      students: data.students,
      teacherEmails: data.teacherEmails,
      reservations: getReservations(),
      blockedSlots: getBlockedSlots(),
      lastSyncedAt: data.lastSyncedAt,
    });
  } catch (error: any) {
    console.error("API /api/sheets/sync error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to sync spreadsheet" },
      { status: 500 }
    );
  }
}
