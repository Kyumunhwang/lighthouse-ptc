import { NextRequest, NextResponse } from "next/server";
import { getConfig, updateConfig } from "@/lib/config";
import {
  adminAddTeacher,
  adminDeleteTeacher,
  adminUpdateTeacher,
  addBlockedSlot,
  deleteBlockedSlot,
  syncSheetsData,
  TeacherRecord,
} from "@/lib/sheets";

export async function GET() {
  return NextResponse.json({
    success: true,
    config: getConfig(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, configData, teacherData, teacherId } = body;

    if (action === "UPDATE_CONFIG") {
      const updated = updateConfig(configData);
      // Re-sync sheets with new config
      await syncSheetsData(true);
      return NextResponse.json({ success: true, config: updated });
    }

    if (action === "ADD_TEACHER") {
      const newTeacher: TeacherRecord = {
        id: `t_custom_${Date.now()}`,
        nameEn: teacherData.nameEn || "",
        nameKo: teacherData.nameKo || "",
        role: teacherData.role || "",
        options: teacherData.options || [],
      };
      adminAddTeacher(newTeacher);
      return NextResponse.json({ success: true, teacher: newTeacher });
    }

    if (action === "UPDATE_TEACHER") {
      adminUpdateTeacher(teacherData);
      return NextResponse.json({ success: true, teacher: teacherData });
    }

    if (action === "DELETE_TEACHER") {
      adminDeleteTeacher(teacherId);
      return NextResponse.json({ success: true, teacherId });
    }

    if (action === "ADD_BLOCKED_SLOT") {
      const { blockData } = body;
      const newBlocked = {
        id: `blk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        teacherName: blockData.teacherName || "ALL",
        date: blockData.date || "ALL",
        timeSlot: blockData.timeSlot || "ALL",
        reason: blockData.reason || "학교 운영상 상담 불가",
        createdAt: new Date().toISOString(),
      };
      addBlockedSlot(newBlocked);
      return NextResponse.json({ success: true, blockedSlot: newBlocked });
    }

    if (action === "DELETE_BLOCKED_SLOT") {
      const { blockId } = body;
      deleteBlockedSlot(blockId);
      return NextResponse.json({ success: true, blockId });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed admin operation" },
      { status: 500 }
    );
  }
}
