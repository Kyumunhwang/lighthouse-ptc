import { NextRequest, NextResponse } from "next/server";
import { syncSheetsData, getReservations, getBlockedSlots } from "@/lib/sheets";
import { getConfig } from "@/lib/config";
import { getSupabaseStatus } from "@/lib/persistence";

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
      supabaseStatus: getSupabaseStatus(),
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
      { success: false, error: error.message || "스프레드시트 및 데이터베이스 동기화에 실패했습니다." },
      { status: 500 }
    );
  }
}
